import { chromium } from '@playwright/test'
import { writeFileSync, readFileSync } from 'fs'

async function main() {
  const browser = await chromium.launch({ headless: true })
  const page = await (await browser.newContext({
    viewport: { width: 1715, height: 1008 },
    colorScheme: 'dark',
    reducedMotion: 'reduce',
  })).newPage()
  page.on('pageerror', () => {})

  await page.goto('https://mn-ccore-lab.pages.dev/portal/my-tasks', { waitUntil: 'load' })
  await page.waitForTimeout(3000)

  // Take raw screenshot
  const raw = await page.screenshot({ type: 'png' })
  writeFileSync('review/visual-audit/compression-raw.png', raw)
  console.log(`Raw PNG: ${(raw.length / 1024).toFixed(0)}KB`)

  // Simulate what the modal does: compress via canvas in browser
  const compressed = await page.evaluate(async () => {
    const canvas = document.createElement('canvas')
    const img = new Image()

    // Take a screenshot via canvas of the current page
    // We'll simulate by drawing current viewport
    canvas.width = 800
    canvas.height = Math.round(800 * (window.innerHeight / window.innerWidth))
    const ctx = canvas.getContext('2d')!
    // Can't actually capture page via canvas, so let's test with a known image instead
    // Return the compression ratio info
    return { width: canvas.width, height: canvas.height }
  })
  console.log(`Target compression: ${compressed.width}x${compressed.height}`)

  // Do the actual compression server-side to test quality
  // Resize raw PNG to 800px wide JPEG 60%
  const sharp = await import('sharp').catch(() => null)
  if (sharp) {
    const jpegBuf = await sharp.default(raw).resize(800).jpeg({ quality: 60 }).toBuffer()
    writeFileSync('review/visual-audit/compression-60.jpg', jpegBuf)
    console.log(`JPEG 60%: ${(jpegBuf.length / 1024).toFixed(0)}KB`)

    const jpeg80 = await sharp.default(raw).resize(800).jpeg({ quality: 80 }).toBuffer()
    writeFileSync('review/visual-audit/compression-80.jpg', jpeg80)
    console.log(`JPEG 80%: ${(jpeg80.length / 1024).toFixed(0)}KB`)
  } else {
    console.log('sharp not available, testing via Playwright canvas instead')
    // Use Playwright to do the compression like the modal does
    const dataUrl = await page.evaluate(async (pngBase64: string) => {
      return new Promise<string>((resolve) => {
        const img = new Image()
        img.onload = () => {
          const canvas = document.createElement('canvas')
          const scale = img.width > 800 ? 800 / img.width : 1
          canvas.width = img.width * scale
          canvas.height = img.height * scale
          const ctx = canvas.getContext('2d')!
          ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
          resolve(canvas.toDataURL('image/jpeg', 0.6))
        }
        img.src = `data:image/png;base64,${pngBase64}`
      })
    }, raw.toString('base64'))

    const base64Data = dataUrl.split(',')[1]
    const jpegBuf = Buffer.from(base64Data, 'base64')
    writeFileSync('review/visual-audit/compression-browser-60.jpg', jpegBuf)
    console.log(`Browser JPEG 60%: ${(jpegBuf.length / 1024).toFixed(0)}KB`)
    console.log(`Base64 length: ${dataUrl.length} chars`)

    // Also test 80%
    const dataUrl80 = await page.evaluate(async (pngBase64: string) => {
      return new Promise<string>((resolve) => {
        const img = new Image()
        img.onload = () => {
          const canvas = document.createElement('canvas')
          const scale = img.width > 800 ? 800 / img.width : 1
          canvas.width = img.width * scale
          canvas.height = img.height * scale
          const ctx = canvas.getContext('2d')!
          ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
          resolve(canvas.toDataURL('image/jpeg', 0.8))
        }
        img.src = `data:image/png;base64,${pngBase64}`
      })
    }, raw.toString('base64'))

    const buf80 = Buffer.from(dataUrl80.split(',')[1], 'base64')
    writeFileSync('review/visual-audit/compression-browser-80.jpg', buf80)
    console.log(`Browser JPEG 80%: ${(buf80.length / 1024).toFixed(0)}KB`)
    console.log(`Base64 length 80%: ${dataUrl80.length} chars`)
  }

  await browser.close()
}

main().catch(console.error)
