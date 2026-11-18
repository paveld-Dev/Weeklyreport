import fs from 'fs';

const svg = fs.readFileSync('armialogo.svg', 'utf8');
const match = svg.match(/xlink:href="data:image\/png;base64,([^"]+)"/);

if (match && match[1]) {
  fs.writeFileSync('armialogo.png', Buffer.from(match[1], 'base64'));
  console.log('Successfully saved armialogo.png');
} else {
  console.error('Could not find base64 PNG in armialogo.svg');
}
