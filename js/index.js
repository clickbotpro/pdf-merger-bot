"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
/*
This is a simple bot that utilizes the cbp-client library.
You can use it as a starting point for your bot. It provides access to the internal ClickbotPro browser and other features.
Docs: https://clickbot.pro/docs
*/
const cbp_client_1 = __importDefault(require("cbp-client"));
const path_1 = __importDefault(require("path"));
const fs_1 = __importDefault(require("fs"));
const pdf_lib_1 = require("pdf-lib");
const client = new cbp_client_1.default();
const logger = client.logger;
(() => __awaiter(void 0, void 0, void 0, function* () {
    yield client.connect();
    try {
        yield start();
    }
    catch (e) {
        yield logger.error(e.message);
    }
    yield client.disconnect();
}))();
function start() {
    return __awaiter(this, void 0, void 0, function* () {
        const inputFolderPaths = JSON.parse(process.env.inputFolderPath);
        const outputFolderPath = client.getUserSettings().outputFolderPath;
        let inputFolderPath;
        if (Array.isArray(inputFolderPaths) && inputFolderPaths.length > 0) {
            inputFolderPath = inputFolderPaths[0];
            if (!fs_1.default.existsSync(inputFolderPath)) {
                throw new Error("Input folder does not exist: " + inputFolderPath);
            }
            yield logger.log('Input folder', inputFolderPath);
        }
        else {
            throw new Error("Input folder not set");
        }
        const doc = yield pdf_lib_1.PDFDocument.create({});
        doc.setProducer('ClickbotPro');
        const files = fs_1.default.readdirSync(inputFolderPath);
        const sortedFiles = sortFilesByName(files);
        let totalFilesMerged = 0;
        for (const file of sortedFiles) {
            const filePath = path_1.default.join(inputFolderPath, file);
            const fileNameLowerCase = path_1.default.basename(file).toLowerCase();
            const isHiddenFile = fileNameLowerCase.startsWith('.');
            if (isHiddenFile) {
                continue;
            }
            const isPdf = fileNameLowerCase.endsWith('.pdf');
            const isJpg = fileNameLowerCase.endsWith('.jpg') || fileNameLowerCase.endsWith('.jpeg');
            const isPng = fileNameLowerCase.endsWith('.png');
            if (isPdf) {
                const added = yield addEntireDocument(doc, filePath);
                if (added) {
                    yield logger.log('Merged pdf: ' + file);
                    totalFilesMerged++;
                }
            }
            else if (isJpg || isPng) {
                const imageBytes = fs_1.default.readFileSync(filePath);
                const image = yield (isPng ? doc.embedPng(imageBytes) : doc.embedJpg(imageBytes));
                const imgPage = doc.insertPage(doc.getPageCount());
                imgPage.setSize(image.width, image.height);
                imgPage.drawImage(image, {
                    x: 0, y: 0,
                    width: image.width,
                    height: image.height,
                });
                yield logger.log('Merged image: ' + file);
                totalFilesMerged++;
            }
            else {
                yield logger.warn('Skip file: ' + file);
            }
        }
        let outputFilePath = path_1.default.join(outputFolderPath, 'merged.pdf');
        if (typeof (process.env.outputFilePath) === "string") {
            const paths = JSON.parse(process.env.outputFilePath);
            if (paths.length > 0) {
                outputFilePath = paths[0];
            }
        }
        const pdfBytes = yield doc.save();
        yield fs_1.default.writeFileSync(outputFilePath, pdfBytes);
        const bytesToMb = (bytes) => (bytes / 1024 / 1024).toFixed(2);
        yield logger.log('Total files merged: ' + totalFilesMerged + ", Size: " + bytesToMb(pdfBytes.length) + " mb", outputFilePath);
    });
}
function addEntireDocument(doc, filePath) {
    return __awaiter(this, void 0, void 0, function* () {
        const buffer = fs_1.default.readFileSync(filePath);
        try {
            const srcDoc = yield pdf_lib_1.PDFDocument.load(buffer, { updateMetadata: false, ignoreEncryption: false });
            const indices = srcDoc.getPageIndices();
            const copiedPages = yield doc.copyPages(srcDoc, indices);
            copiedPages.forEach((page) => doc.addPage(page));
            return true;
        }
        catch (e) {
            //https://github.com/Hopding/pdf-lib/issues/387
            if (e.message === (new pdf_lib_1.EncryptedPDFError()).message) {
                yield logger.warn('Skip encrypted pdf: ' + filePath);
            }
            else {
                yield logger.error(e.message);
            }
        }
        return false;
    });
}
const sortFilesByName = (files) => {
    const sortedFiles = files.sort((a, b) => {
        const aName = a.toLowerCase();
        const bName = b.toLowerCase();
        if (aName < bName) {
            return -1;
        }
        if (aName > bName) {
            return 1;
        }
        return 0;
    });
    return sortedFiles;
};
