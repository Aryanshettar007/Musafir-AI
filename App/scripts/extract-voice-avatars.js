const fs = require('fs');
const path = require('path');

async function main() {
  const htmlPath = path.resolve(__dirname, '../../temp-model-images.txt');
  if (!fs.existsSync(htmlPath)) {
    throw new Error(`temp-model-images.txt not found at ${htmlPath}`);
  }

  const html = fs.readFileSync(htmlPath, 'utf8');

  // Regex to extract all img tags with alt (voice name) and src (avatar url)
  const regex = /<img[^>]+alt="([^"]+)"[^>]+src="([^"]+)"/g;
  const urlMap = new Map(); // url -> filename
  const voiceToAvatarNum = {};

  let match;
  while ((match = regex.exec(html)) !== null) {
    const [, voiceName, src] = match;
    const filename = path.basename(src); // e.g., '1.webp'
    urlMap.set(src, filename);
    const numMatch = filename.match(/^(\d+)\.webp$/);
    if (numMatch) {
      voiceToAvatarNum[voiceName] = parseInt(numMatch[1], 10);
    }
  }

  console.log(`Extracted ${urlMap.size} unique avatar URLs across ${Object.keys(voiceToAvatarNum).length} voices.`);

  const outDir = path.resolve(__dirname, '../assets/images/voice-avatars');
  if (!fs.existsSync(outDir)) {
    fs.mkdirSync(outDir, { recursive: true });
  }

  // Download all avatar images
  for (const [src, filename] of urlMap.entries()) {
    const dest = path.join(outDir, filename);
    console.log(`Downloading ${src} -> ${filename}...`);
    const resp = await fetch(src);
    if (!resp.ok) {
      throw new Error(`Failed to download ${src}: HTTP ${resp.status}`);
    }
    const arrayBuffer = await resp.arrayBuffer();
    fs.writeFileSync(dest, Buffer.from(arrayBuffer));
    console.log(`Saved ${filename} (${arrayBuffer.byteLength} bytes)`);
  }

  console.log('\nAll voice avatars successfully extracted and saved locally to App/assets/images/voice-avatars/');
}

main().catch((err) => {
  console.error('Extraction error:', err);
  process.exit(1);
});
