import {
  archivePlugin,
  audioPlugin,
  fallbackPlugin,
  imagePlugin,
  officePlugin,
  pdfPlugin,
  textPlugin,
  videoPlugin,
} from '@open-file-viewer/core'
import type { PreviewPlugin } from '@open-file-viewer/core'
import pdfWorkerSrc from 'pdfjs-dist/build/pdf.worker.mjs?url'

export const drivePreviewPlugins: PreviewPlugin[] = [
  imagePlugin(),
  videoPlugin(),
  audioPlugin(),
  officePlugin(),
  pdfPlugin({ workerSrc: pdfWorkerSrc }),
  textPlugin(),
  archivePlugin(),
  fallbackPlugin(),
]
