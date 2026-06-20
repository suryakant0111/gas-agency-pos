import http from 'http'
import crypto from 'crypto'
import os from 'os'
import QRCode from 'qrcode'
import { BrowserWindow, app } from 'electron'
import { recognizeFromDataUrl } from './passbook-ocr'
import { parsePassbookText } from './passbook-parser'
import localtunnel from 'localtunnel'

let server: http.Server | null = null
let tunnel: Awaited<ReturnType<typeof localtunnel>> | null = null
export let serverUrl = ''
export let qrCodeDataURL = ''
export let serverToken = ''
export let tunnelPublicUrl = ''

const UPLOAD_PAGE_HTML = `<!DOCTYPE html>
<html><head><meta name="viewport" content="width=device-width,initial-scale=1">
<title>HP Gas Agency — Passbook Upload</title>
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:-apple-system,BlinkMacSystemFont,sans-serif;background:#f0f4f8;min-height:100vh;display:flex;align-items:center;justify-content:center;padding:20px}
.card{background:#fff;border-radius:16px;box-shadow:0 4px 24px rgba(0,0,0,.1);padding:32px;max-width:420px;width:100%}
h1{font-size:20px;color:#0f172a;margin-bottom:4px;text-align:center}
.sub{color:#64748b;font-size:14px;margin-bottom:24px;text-align:center}
.btn{display:inline-flex;align-items:center;justify-content:center;gap:8px;background:linear-gradient(135deg,#3b82f6,#1d4ed8);color:#fff;font-weight:700;padding:14px 28px;border-radius:12px;border:none;font-size:16px;cursor:pointer;width:100%;text-transform:uppercase;letter-spacing:.5px}
.btn:active{opacity:.8}
input[type="file"]{display:none}
.status{margin-top:16px;padding:16px;border-radius:12px;font-size:14px;font-weight:600;display:none}
.status.ok{display:block;background:#dcfce7;color:#166534}
.status.err{display:block;background:#fee2e2;color:#991b1b}
.status.working{display:block;background:#dbeafe;color:#1e40af}
.preview{margin-top:16px;display:none}
.preview img{max-width:100%;border-radius:8px}
.note{font-size:11px;color:#94a3b8;margin-top:16px;text-align:center}
.connected{background:#ecfdf5;color:#166534;padding:8px 12px;border-radius:8px;font-size:12px;text-align:center;margin-bottom:16px;display:flex;align-items:center;gap:6px}
.connected::before{content:"";width:8px;height:8px;border-radius:50%;background:#10b981;flex-shrink:0}
</style></head><body>
<div class="card">
<h1>HP Gas Agency</h1>
<p class="sub">Scan &amp; Upload Passbook</p>
<div class="connected">Connected to your POS</div>
<label class="btn" for="camera">
<input type="file" id="camera" accept="image/*" capture="environment" />
📷 Take Photo
</label>
<div id="preview" class="preview">
<img id="img" />
</div>
<div id="status" class="status"></div>
<p class="note">Photo is sent to your PC only — not stored online</p>
</div>
<script>
const fileInput = document.getElementById('camera')
const status = document.getElementById('status')
const preview = document.getElementById('preview')
const img = document.getElementById('img')
fileInput.addEventListener('change', e => {
  const file = e.target.files[0]
  if (!file) return
  const url = URL.createObjectURL(file)
  img.src = url
  preview.style.display = 'block'
  status.className = 'status working'
  status.textContent = 'Uploading &amp; scanning...'
  status.style.display = 'block'
  const fd = new FormData()
  fd.append('image', file)
  fetch('/upload' + window.location.search, {
    method: 'POST', body: fd
  }).then(r => r.json()).then(d => {
    if (d.success) {
      status.className = 'status ok'
      status.textContent = '✓ Scan complete! Results sent to your PC.'
    } else {
      status.className = 'status err'
      status.textContent = 'Error: ' + (d.error || 'Unknown error')
    }
  }).catch(err => {
    status.className = 'status err'
    status.textContent = 'Upload failed. Refresh or check connection.'
  })
})
</script>
</body></html>`

function getLanIP(): string {
  const ifaces = os.networkInterfaces()
  for (const name of Object.keys(ifaces)) {
    for (const info of ifaces[name] || []) {
      if (info.family === 'IPv4' && !info.internal) return info.address
    }
  }
  return '127.0.0.1'
}

function parseMultipart(body: string, boundary: string): { imageBase64?: string } {
  const parts = body.split('--' + boundary)
  for (const part of parts) {
    if (part.includes('Content-Type: image')) {
      const idx = part.indexOf('\r\n\r\n')
      if (idx !== -1) {
        let dataStr = part.slice(idx + 4)
        if (dataStr.endsWith('\r\n')) dataStr = dataStr.slice(0, -2)
        const buf = Buffer.from(dataStr, 'binary')
        return { imageBase64: 'data:image/jpeg;base64,' + buf.toString('base64') }
      }
    }
  }
  return {}
}

export async function startPassbookHTTP(): Promise<{ url: string; qrCode: string; info: string }> {
  if (server) return { url: tunnelPublicUrl || serverUrl, qrCode: qrCodeDataURL, info: 'Already running' }

  serverToken = crypto.randomBytes(8).toString('hex')
  const PORT = 9876
  const ip = getLanIP()
  serverUrl = `http://${ip}:${PORT}/scan?token=${serverToken}`

  return new Promise((resolve) => {
    server = http.createServer(async (req, res) => {
      const url = new URL(req.url!, `http://${ip}:${PORT}`)
      console.log(`[scanner] ${req.method} ${url.pathname} from ${req.socket.remoteAddress}`)

      // CORS
      res.setHeader('Access-Control-Allow-Origin', '*')
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
      if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return }

      // Ping / health check
      if (req.method === 'GET' && url.pathname === '/ping') {
        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ ok: true, time: Date.now() }))
        return
      }

      // Upload page
      if (req.method === 'GET' && url.pathname === '/scan') {
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
        res.end(UPLOAD_PAGE_HTML)
        return
      }

      // Upload handler
      if (req.method === 'POST' && url.pathname === '/upload' && url.searchParams.get('token') === serverToken) {
        console.log('[scanner] Processing upload...')
        let body: Buffer[] = []
        req.on('data', chunk => { body.push(chunk) })
        req.on('end', async () => {
          try {
            const contentType = req.headers['content-type'] || ''
            const boundaryMatch = contentType.match(/boundary=(.+)/)
            if (!boundaryMatch) {
              res.writeHead(400, { 'Content-Type': 'application/json' })
              res.end(JSON.stringify({ success: false, error: 'Invalid content type' }))
              return
            }

            const rawBuffer = Buffer.concat(body)
            const boundary = boundaryMatch[1]
            const boundaryBuffer = Buffer.from('--' + boundary)

            // Find image data between boundaries
            const parts = rawBuffer.toString('binary').split('--' + boundary)
            let imageBase64: string | undefined
            for (const part of parts) {
              if (part.includes('Content-Type: image')) {
                const idx = part.indexOf('\r\n\r\n')
                if (idx !== -1) {
                  let dataStr = part.slice(idx + 4)
                  if (dataStr.endsWith('\r\n')) dataStr = dataStr.slice(0, -2)
                  const buf = Buffer.from(dataStr, 'binary')
                  imageBase64 = 'data:image/jpeg;base64,' + buf.toString('base64')
                  break
                }
              }
            }

            if (!imageBase64) {
              console.log('[scanner] No image found in upload')
              res.writeHead(400, { 'Content-Type': 'application/json' })
              res.end(JSON.stringify({ success: false, error: 'No image found' }))
              return
            }

            console.log('[scanner] Running OCR...')
            const { text, confidence } = await recognizeFromDataUrl(imageBase64)
            const parsed = parsePassbookText(text, confidence)
            console.log(`[scanner] OCR done: ${parsed.extractedBookings.length} bookings, confidence ${Math.round(confidence)}%`)

            // Push to renderer
            const win = BrowserWindow.getAllWindows()[0]
            win?.webContents.send('scanner:ocr-result', parsed)

            // Respond to phone
            res.writeHead(200, { 'Content-Type': 'application/json' })
            res.end(JSON.stringify({ success: true, bookings: parsed.extractedBookings.length }))
          } catch (e: any) {
            console.error('[scanner] Upload error:', e)
            res.writeHead(500, { 'Content-Type': 'application/json' })
            res.end(JSON.stringify({ success: false, error: e.message }))
          }
        })
        return
      }

      // Fallback — serve a simple "you reached the scanner" page
      res.writeHead(200, { 'Content-Type': 'text/plain' })
      res.end('HP Gas Agency Scanner Server\nEndpoints: /scan (upload page), /ping (health check)')
    })

    server.on('error', (e: any) => {
      console.error(`[scanner] Server error on port ${PORT}:`, e.message)
      if (e.code === 'EADDRINUSE') {
        console.error(`[scanner] Port ${PORT} is in use. Choose a different port or free it up.`)
      }
    })

    server.listen(PORT, '0.0.0.0', async () => {
      console.log(`[scanner] Local server started at ${serverUrl}`)
      console.log('[scanner] Opening internet tunnel...')

      // Create public tunnel
      try {
        tunnel = await localtunnel({ port: PORT })
        tunnelPublicUrl = tunnel.url
        const fullUrl = `${tunnelPublicUrl}/scan?token=${serverToken}`
        qrCodeDataURL = await QRCode.toDataURL(fullUrl, { width: 256, margin: 2 })
        console.log(`[scanner] Tunnel open: ${fullUrl}`)
        resolve({ url: fullUrl, qrCode: qrCodeDataURL, info: `Tunnel: ${tunnelPublicUrl}` })
      } catch (e: any) {
        // Fallback to LAN if tunnel fails
        console.error('[scanner] Tunnel failed, using local server only:', e.message)
        qrCodeDataURL = await QRCode.toDataURL(serverUrl, { width: 256, margin: 2 })
        resolve({ url: serverUrl, qrCode: qrCodeDataURL, info: 'Server running locally' })
      }
    })
  })
}

export function stopPassbookHTTP() {
  if (server) {
    server.close()
    server = null
    if (tunnel) {
      tunnel.close()
      tunnel = null
    }
    serverUrl = ''
    qrCodeDataURL = ''
    tunnelPublicUrl = ''
    serverToken = ''
    console.log('Passbook scanner server stopped')
  }
}
