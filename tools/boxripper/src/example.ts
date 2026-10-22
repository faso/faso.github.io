// Original canvas-drawn sample. No remote photos or licensed assets.
export const EXAMPLE_FACES = {
  front: [[235, 215], [560, 250], [560, 625], [235, 590]],
  right: [[560, 250], [740, 151], [740, 526], [560, 625]],
  top: [[415, 116], [740, 151], [560, 250], [235, 215]],
};

export async function createExamplePhoto(): Promise<File> {
  const canvas = document.createElement('canvas');
  canvas.width = 960;
  canvas.height = 720;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#c8c3b5';
  ctx.fillRect(0, 0, 960, 720);
  ctx.fillStyle = '#b9b5a8';
  ctx.fillRect(0, 506, 960, 214);
  ctx.strokeStyle = '#a6a499';
  ctx.lineWidth = 2;
  for (let x = -400; x < 1400; x += 220) {
    ctx.beginPath();
    ctx.moveTo(x, 506);
    ctx.lineTo(x - 280, 720);
    ctx.stroke();
  }
  ctx.fillStyle = '#5a60503b';
  ctx.beginPath();
  ctx.moveTo(235, 590);
  ctx.lineTo(560, 625);
  ctx.lineTo(835, 565);
  ctx.lineTo(740, 526);
  ctx.fill();

  // Front panel. Affine projections match the editable face quads above.
  ctx.save();
  ctx.setTransform(1, 35 / 325, 0, 1, 235, 215);
  ctx.fillStyle = '#789184';
  ctx.fillRect(0, 0, 325, 375);
  ctx.fillStyle = '#263d35';
  ctx.fillRect(12, 14, 301, 347);
  ctx.fillStyle = '#8ba393';
  ctx.fillRect(16, 18, 293, 339);
  ctx.fillStyle = '#a0b3a1';
  ctx.fillRect(21, 23, 283, 5);
  ctx.fillStyle = '#40584a';
  for (let i = 0; i < 6; i++) ctx.fillRect(50, 54 + i * 13, 225, 5);
  ctx.fillStyle = '#eee1b5';
  ctx.fillRect(53, 178, 108, 86);
  ctx.fillStyle = '#333d35';
  ctx.font = 'bold 19px monospace';
  ctx.fillText('FIELD', 68, 208);
  ctx.fillText('BOX 01', 68, 235);
  ctx.fillStyle = '#526c5b';
  ctx.fillRect(268, 195, 12, 42);
  ctx.fillStyle = '#d0ceaf';
  ctx.fillRect(270, 197, 8, 22);
  ctx.fillStyle = '#d67c55';
  ctx.fillRect(52, 295, 57, 31);
  ctx.fillStyle = '#f3e8ca';
  ctx.font = 'bold 13px monospace';
  ctx.fillText('061', 65, 316);
  ctx.restore();

  ctx.save();
  ctx.setTransform(1, -0.55, 0, 1, 560, 250);
  ctx.fillStyle = '#596f63';
  ctx.fillRect(0, 0, 180, 375);
  ctx.fillStyle = '#40574b';
  ctx.fillRect(13, 15, 154, 343);
  ctx.fillStyle = '#667e6d';
  ctx.fillRect(17, 19, 146, 335);
  ctx.fillStyle = '#344e40';
  for (let i = 0; i < 9; i++) ctx.fillRect(38, 70 + i * 12, 104, 4);
  ctx.fillStyle = '#d9c77e';
  ctx.beginPath();
  ctx.moveTo(90, 229);
  ctx.lineTo(118, 275);
  ctx.lineTo(62, 275);
  ctx.fill();
  ctx.fillStyle = '#44533e';
  ctx.font = 'bold 25px monospace';
  ctx.fillText('!', 82, 270);
  ctx.restore();

  ctx.save();
  ctx.setTransform(1, 35 / 325, 1, -0.55, 235, 215);
  ctx.fillStyle = '#a4b29a';
  ctx.fillRect(0, 0, 325, 180);
  ctx.strokeStyle = '#6a806c';
  ctx.lineWidth = 3;
  ctx.strokeRect(8, 8, 309, 164);
  ctx.restore();

  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((result) => result ? resolve(result) : reject(new Error('Could not create sample')), 'image/png');
  });
  return new File([blob], 'sample-field-box.png', { type: 'image/png' });
}
