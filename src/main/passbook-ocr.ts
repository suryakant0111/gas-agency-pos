import { createWorker, type RecognizeResult } from 'tesseract.js'
import { app, BrowserWindow } from 'electron'
import path from 'path'

let worker: Awaited<ReturnType<typeof createWorker>> | null = null
let modelReady = false

function getLangPath(): string {
  return path.join(app.getPath('userData'), 'tesseract-data')
}

export function isModelReady(): boolean {
  return modelReady
}

export async function preloadModel() {
  if (worker) return worker
  const langPath = getLangPath()
  console.log('Loading OCR model from:', langPath)
  worker = await createWorker('eng+hin', 1, {
    langPath,
    logger: () => {}, // suppress preload logging noise
  })
  modelReady = true
  console.log('OCR model ready for instant scans')
  return worker
}

export async function getWorker() {
  return await getWorkerWithProgress()
}

export async function getWorkerWithProgress() {
  if (worker) return worker
  const langPath = getLangPath()
  return new Promise((resolve) => {
    createWorker('eng+hin', 1, {
      langPath,
      logger: (m) => {
        if (m.status === 'recognizing text') {
          const win = BrowserWindow.getAllWindows()[0]
          win?.webContents.send('scanner:progress', m.progress)
        }
      },
    }).then((w) => {
      modelReady = true
      worker = w
      resolve(w)
    })
  })
}

export interface OcrResult {
  text: string
  confidence: number
}

export async function recognizeFromDataUrl(dataURL: string): Promise<OcrResult> {
  const w = await getWorkerWithProgress()
  const base64 = dataURL.split(',')[1]
  if (!base64) throw new Error('Invalid image data URL')

  const buffer = Buffer.from(base64, 'base64')
  const { data } = await w.recognize(buffer) as { data: RecognizeResult }
  return { text: data.text, confidence: data.confidence }
}

export async function terminateWorker() {
  if (worker) {
    await worker.terminate()
    worker = null
  }
}
