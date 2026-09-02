import { describe, expect, it } from 'vitest'
import { isOfficePreviewFile } from '../officefile'

describe('isOfficePreviewFile', () => {
  it('accepts the WebOffice document families and pdf', () => {
    for (const ext of ['doc', 'docx', 'rtf', 'xls', 'xlsx', 'ppt', 'pptx', 'wps', 'et', 'dps', 'pdf']) expect(isOfficePreviewFile(ext)).toBe(true)
  })

  it('ignores case and a leading dot', () => {
    expect(isOfficePreviewFile('DOCX')).toBe(true)
    expect(isOfficePreviewFile('.pdf')).toBe(true)
  })

  it('rejects everything else', () => {
    for (const ext of ['', undefined, 'zip', 'mp4', 'jpg', 'txt', 'md', 'pdfx']) expect(isOfficePreviewFile(ext)).toBe(false)
  })
})
