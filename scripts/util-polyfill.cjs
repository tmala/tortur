 
const util = require('node:util')
if (!util.styleText) {
  util.styleText = (_format, text) => String(text)
}
