export interface ExtractedBooking {
  consumerNumber: string
  customerName: string
  bookingDate: string
  otp: string
  cylinderType: string
  quantity: number
  include: boolean
  highlight: boolean
}

export interface CoverPageData {
  consumerNumber: string
  consumerName: string
  address: string
  distributorCode: string
  distributorName: string
  distributorAddress: string
  phone: string
  state: string
  cylinderType: string
  bookingMissedCallNumber: string
}

export interface PassbookScanResult {
  rawText: string
  confidence: number
  extractedBookings: ExtractedBooking[]
  coverPage?: CoverPageData
  errors: string[]
}

// ── Cover page parser ─────────────────────────────────────────
// Detects "CARD SERIAL NO", "CONSUMER NO", "DISTRIBUTOR" etc.

function parseCoverPage(rawText: string): CoverPageData | null {
  const text = rawText.trim()
  const lower = text.toLowerCase()

  // Must have both consumer number and distributor markers
  if (!/con(sumer)?[._\s]*no/i.test(text)) return null
  if (!/distribut/i.test(text)) return null

  // Consumer number: 6-12 digit boxed number near "CONSUMER NO"
  const consumerMatch = text.match(/(?:consumer[._\s]*no|उपभोक्ता[._\s]*क्र\.?)\s*:?\s*\[?\s*(\d{4,12})/)
    ?? text.match(/(?:consumer[._\s]*no|उपभोक्ता[._\s]*क्र\.?)\s*:?\s*[\n\s]*(\d{4,12})/)
    ?? text.match(/consumer[.\s]*no[\s:.]*\n?\s*(\d{5,12})/)
  const consumerNo = consumerMatch?.[1]?.replace(/\s/g, '') ?? ''

  // Consumer name: "CONSUMER'S NAME:" followed by handwritten name (alphabetic)
  const nameMatch = text.match(/(?:consumer['\s]*name|उपभोक्ता[._\s]*का[._\s]*नाम)\s*:?\s*\n?\s*([A-Za-z\-\s'.]+?)(?:\n|$)/i)
  const consumerName = nameMatch?.[1]?.trim().replace(/\s+/g, ' ') ?? ''

  // Full address block: "ADDRESS:" then up to 2 lines
  const addrMatch = text.match(/(?:ADDRESS|पता)\s*:?\s*\n?\s*([^\n]+)/i)
  let address = addrMatch?.[1]?.trim() ?? ''
  // Second address line (city / state)
  const addr2 = text.match(/(?:ADDRESS|पता)\s*:?\s*[^\n]*\n\s*([A-Za-z][^\n]{10,60})/i)
  if (addr2) address += ', ' + addr2[1].trim()

  // Distributor code
  const distCode = text.match(/(?:distributor['\s]*code|वितरक[._\s]*का[._\s]*कोड)\s*:?\s*(\d{5,10})/i)?.[1] ?? ''

  // Distributor name
  const distName = text.match(/(?:distributor['\s]*name|वितरक[._\s]*का[._\s]*नाम)\s*:?\s*\n?\s*(.+?)(?:\n|$)/i)?.[1]?.trim() ?? ''

  // Phone
  const phoneMatch = text.match(/(?:PHONE|फोन|Cell)\s*:?\s*([\d\s\-–]{6,15})/i)
  const phone = phoneMatch?.[1]?.replace(/\s/g, ' ').trim() ?? ''

  // State
  const state = text.match(/(?:STATE|राज्य)\s*:?\s*([A-Za-z\s]+?)(?:\n|$)/i)?.[1]?.trim() ?? ''

  // Cylinder type
  const cylType = text.match(/(?:TYPE\s*OF\s*CYLINDERS?|सिलिण्डरों??\s*का\s*प्रकार)\s*:?\s*(\w+)/i)?.[1] ?? ''

  // Booking missed call number
  const missedCall = text.match(/(?:missed\s*call\s*no\.?\s*[\.:]?\s*)(\d{10})/i)?.[1] ?? ''

  if (!consumerNo && !consumerName) return null

  return {
    consumerNumber: consumerNo,
    consumerName,
    address,
    distributorCode: distCode,
    distributorName: distName,
    distributorAddress: '',
    phone,
    state,
    cylinderType: cylType,
    bookingMissedCallNumber: missedCall,
  }
}


// ── Booking entry page parser ─────────────────────────────────
// Looks for rows containing dates + (consumer number OR OTP)

function isSkipLine(line: string): boolean {
  const skips = [
    'hp gas', 'hindustan petroleum', 'indianoil', 'bharat petroleum',
    'passbook', 'consumer', 'booking', 'agency', 'भारत', 'पेट्रोलियम',
    'page no', 'sr no', 'serial no', 's.no', 'sl no',
    'otp', 'authentication',
    '₹', 'price', 'amount', 'charges'
  ]
  return skips.some(s => line.includes(s))
}

function extractName(line: string, knownParts: (string | undefined)[]): string {
  let rest = line
  for (const part of knownParts) {
    if (part) rest = rest.replace(part, '')
  }
  rest = rest.replace(/[\/\-|,;:()\[\]{}"]/g, ' ')
    .replace(/\d+/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim()
  if (!rest || rest.length < 2) return ''
  return rest.split(/\s+/).filter(p => p.length > 1).slice(0, 4).join(' ').trim()
}

function parseBookingEntries(rawText: string, ocrConfidence: number): ExtractedBooking[] {
  const bookings: ExtractedBooking[] = []
  const lines = rawText
    .split('\n')
    .map(l => l.trim())
    .filter(l => l.length > 3)

  for (const line of lines) {
    const lowerLine = line.toLowerCase()
    if (isSkipLine(lowerLine)) continue

    const consumerMatch = line.match(/(\d{10,12})/)
    const dateMatch = line.match(/(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})/)
    const otpMatch = line.match(/[Oo]?[Tt]?[Pp]?[\s:]*\b(\d{4,8})\b/)
    const cylSizeMatch = line.match(/(14\.2|5\s*kg|19|47\.5|19\s*kg|47\.5\s*kg)/i)
    const cylTypeMatch = line.match(/(Domestic|Commercial|FTL|घरेलू|वाणिज्यिक)/i)

    const hasConsumerNo = consumerMatch !== null
    const hasDate = dateMatch !== null

    if (hasConsumerNo || (hasDate && line.length > 10)) {
      let consumer = consumerMatch ? consumerMatch[1].replace(/\s/g, '') : ''
      let dateParts = dateMatch ? [dateMatch[1], dateMatch[2], dateMatch[3]] : null
      let bookingDate = new Date().toISOString().slice(0, 10)
      if (dateParts) {
        let [d, m, y] = dateParts
        if (y.length === 2) y = '20' + y
        if (parseInt(d) > 12) {
          bookingDate = `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`
        } else if (parseInt(m) > 12) {
          bookingDate = `${y}-${d.padStart(2, '0')}-${m.padStart(2, '0')}`
        } else {
          bookingDate = `${y}-${d.padStart(2, '0')}-${m.padStart(2, '0')}`
        }
      }
      let otp = otpMatch ? otpMatch[1] : ''
      if (otp === consumer) otp = ''
      let cylinderType = ''
      if (cylSizeMatch) {
        const size = cylSizeMatch[1].toLowerCase().replace(/\s*kg/g, '').replace(/\s/g, '')
        cylinderType = size === '14.2' ? 'Domestic 14.2' :
                       size === '5' ? 'Domestic 5' :
                       size === '19' ? 'Commercial 19' :
                       size === '47.5' ? 'Commercial 47.5' : size
      } else if (cylTypeMatch) {
        const word = cylTypeMatch[1].toLowerCase()
        if (word === 'domestic' || word === 'घरेलू') cylinderType = 'Domestic 14.2'
        else if (word === 'commercial' || word === 'वाणिज्यिक') cylinderType = 'Commercial 19'
        else if (word === 'ftl') cylinderType = 'FTL'
      }
      const name = extractName(line, [consumer, dateMatch?.[0], otp, cylSizeMatch?.[0], cylTypeMatch?.[1]])
      const qty = line.match(/[Qq][Tt]?[Yy][\s:]*[:]*\s*(\d+)/)?.[1] ?? '1'

      bookings.push({
        consumerNumber: consumer,
        customerName: name,
        bookingDate,
        otp,
        cylinderType,
        quantity: parseInt(qty) || 1,
        include: true,
        highlight: false,
      })
    }
  }

  if (bookings.length > 0 && bookings.length <= 2 && ocrConfidence < 60) {
    bookings.forEach(b => { b.highlight = true })
  }

  return bookings
}


// ── Main entry ────────────────────────────────────────────────

export function parsePassbookText(rawText: string, ocrConfidence: number): PassbookScanResult {
  const errors: string[] = []

  if (rawText.trim().length < 10) {
    errors.push('Text unreadable. Try a clearer photo with good lighting.')
    return { rawText, confidence: ocrConfidence, extractedBookings: [], errors }
  }

  // 1) Try cover page
  const cover = parseCoverPage(rawText)

  // 2) Try booking entries
  const bookings = parseBookingEntries(rawText, ocrConfidence)

  // If we got a cover page but no booking rows, that's expected — it's just a consumer info card
  if (cover && bookings.length === 0) {
    errors.push('This looks like a cover page (consumer identity card). Use a photo of the actual booking entries inside the passbook.')
    return { rawText, confidence: ocrConfidence, extractedBookings: bookings, coverPage: cover, errors }
  }

  // If nothing found, give generic error
  if (bookings.length === 0 && !cover) {
    errors.push('No booking patterns found. You can manually enter bookings below.')
  }

  return { rawText, confidence: ocrConfidence, extractedBookings: bookings, coverPage: cover || undefined, errors }
}
