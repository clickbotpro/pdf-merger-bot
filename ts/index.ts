/*
This is a simple bot that utilizes the cbp-client library. 
You can use it as a starting point for your bot. It provides access to the internal ClickbotPro browser and other features.
Docs: https://clickbot.pro/docs
*/
import CbpClient from 'cbp-client';
import path from 'path';
import fs from 'fs';
import { EncryptedPDFError, PDFDocument } from 'pdf-lib';

const client = new CbpClient();
const logger = client.logger;

(async () => {
  await client.connect(); 
  try {
    await start();
  } catch (e:any) {
    await logger.error(e.message);
  }
  await client.disconnect();
})();

async function start():Promise<void>
{
  const inputFolderPaths = JSON.parse(process.env.inputFolderPath as string);
  const outputFolderPath = client.getUserSettings().outputFolderPath;

  let inputFolderPath:string;
  if(Array.isArray(inputFolderPaths) && inputFolderPaths.length>0) {
    inputFolderPath=inputFolderPaths[0];
    if(!fs.existsSync(inputFolderPath)) {
      throw new Error("Input folder does not exist: "+inputFolderPath);
    }
    await logger.log('Input folder', inputFolderPath);
  } else {
    throw new Error("Input folder not set");
  }

  const doc = await PDFDocument.create({});
  doc.setProducer('ClickbotPro');
 
  const files = fs.readdirSync(inputFolderPath);
  const sortedFiles=sortFilesByName(files);

  let totalFilesMerged=0;
  for (const file of sortedFiles) {
    const filePath=path.join(inputFolderPath, file);
    const fileNameLowerCase=path.basename(file).toLowerCase();
    const isHiddenFile=fileNameLowerCase.startsWith('.');
    if(isHiddenFile) {
      continue;
    }
    const isPdf=fileNameLowerCase.endsWith('.pdf');
    const isJpg=fileNameLowerCase.endsWith('.jpg') || fileNameLowerCase.endsWith('.jpeg');
    const isPng=fileNameLowerCase.endsWith('.png');
    if(isPdf) {
      const added=await addEntireDocument(doc, filePath);
      if(added) {
        await logger.log('Merged pdf: '+ file);
        totalFilesMerged++;
      }
    } else if(isJpg || isPng) {
      const imageBytes = fs.readFileSync(filePath);
      const image = await (isPng?doc.embedPng(imageBytes):doc.embedJpg(imageBytes));
      const imgPage = doc.insertPage(doc.getPageCount());
      imgPage.setSize(image.width, image.height); 
      imgPage.drawImage(image, {
        x: 0, y: 0,
        width: image.width,
        height: image.height,
      });
      await logger.log('Merged image: '+ file);
      totalFilesMerged++;
    } else {
      await logger.warn('Skip file: '+file);
    }
  }
  let outputFilePath=path.join(outputFolderPath, 'merged.pdf');
  
  if(typeof(process.env.outputFilePath)==="string") {
    const paths=JSON.parse(process.env.outputFilePath);
    if(paths.length>0) {
      outputFilePath=paths[0];
    }
  }
  const pdfBytes = await doc.save();  
  await fs.writeFileSync(outputFilePath, pdfBytes);
  const bytesToMb=(bytes:number)=>(bytes/1024/1024).toFixed(2);
  await logger.log('Total files merged: '+ totalFilesMerged+", Size: "+bytesToMb(pdfBytes.length)+" mb",outputFilePath);
}
 
async function addEntireDocument(doc:PDFDocument, filePath:any): Promise<boolean>
{
  const buffer = fs.readFileSync(filePath);
  try {
    const srcDoc = await PDFDocument.load(buffer,{updateMetadata:false,ignoreEncryption:false});
    const indices=srcDoc.getPageIndices();
    const copiedPages=await doc.copyPages(srcDoc,indices); 
    copiedPages.forEach((page) => doc.addPage(page));
    return true;
  } catch (e:any) {
    //https://github.com/Hopding/pdf-lib/issues/387
    if(e.message===(new EncryptedPDFError()).message) {
      await logger.warn('Skip encrypted pdf: '+filePath);
    } else {
      await logger.error(e.message);
    }
  }
  return false;
}

const sortFilesByName=(files:Array<string>):Array<string>=>{
  const sortedFiles=files.sort((a, b) => {
    const aName=a.toLowerCase();
    const bName=b.toLowerCase();
    if (aName < bName) {
      return -1;
    }
    if (aName > bName) {
      return 1;
    }
    return 0;
  });
  return sortedFiles;
}