/** Extensions Aliyun's WebOffice previewer accepts: the Word, Excel and PowerPoint families (WPS-based) plus PDF. */
const OFFICE_PREVIEW_EXTS = new Set([
  'doc', 'docm', 'docx', 'dot', 'dotm', 'dotx', 'wps', 'wpt', 'rtf',
  'xls', 'xlsx', 'xlsm', 'xlsb', 'xlt', 'xltx', 'et', 'ett',
  'ppt', 'pptx', 'pptm', 'pps', 'ppsx', 'pot', 'potx', 'dps', 'dpt',
  'pdf'
])

export function isOfficePreviewFile(ext: string | undefined): boolean {
  return OFFICE_PREVIEW_EXTS.has(String(ext || '').toLowerCase().replace(/^\./, ''))
}
