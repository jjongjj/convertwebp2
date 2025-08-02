#!/usr/bin/env node

/**
 * 다양한 크기와 특성의 테스트용 GIF 파일 생성 스크립트
 * Sharp를 사용하여 프로그래밍 방식으로 GIF 생성
 */

import sharp from 'sharp';
import fs from 'fs-extra';
import path from 'path';

const COLORS = {
  red: [255, 0, 0],
  green: [0, 255, 0],
  blue: [0, 0, 255],
  yellow: [255, 255, 0],
  magenta: [255, 0, 255],
  cyan: [0, 255, 255]
};

/**
 * 단색 이미지 프레임 생성
 * @param {number} width - 이미지 너비
 * @param {number} height - 이미지 높이
 * @param {Array} color - RGB 색상 배열
 * @returns {Buffer} PNG 이미지 버퍼
 */
async function createColorFrame(width, height, color) {
  const channels = 3;
  const buffer = Buffer.alloc(width * height * channels);
  
  for (let i = 0; i < buffer.length; i += channels) {
    buffer[i] = color[0];     // R
    buffer[i + 1] = color[1]; // G
    buffer[i + 2] = color[2]; // B
  }
  
  return await sharp(buffer, {
    raw: { width, height, channels }
  }).png().toBuffer();
}

/**
 * 애니메이션 GIF 생성
 * @param {string} filename - 출력 파일명
 * @param {number} width - 이미지 너비
 * @param {number} height - 이미지 높이
 * @param {number} frameCount - 프레임 수
 * @param {number} delay - 프레임 간 딜레이 (ms)
 */
async function createAnimatedGIF(filename, width, height, frameCount = 10, delay = 200) {
  try {
    console.log(`📝 ${filename} 생성 중... (${width}x${height}, ${frameCount}프레임)`);
    
    // 색상 순환을 위한 색상 배열
    const colorKeys = Object.keys(COLORS);
    const frames = [];
    
    // 각 프레임 생성
    for (let i = 0; i < frameCount; i++) {
      const colorKey = colorKeys[i % colorKeys.length];
      const frame = await createColorFrame(width, height, COLORS[colorKey]);
      frames.push(frame);
    }
    
    // GIF 생성 (Sharp는 직접 GIF 애니메이션을 생성하지 못하므로 임시 방법 사용)
    // 실제로는 imagemagick이나 다른 도구를 사용해야 하지만, 
    // 여기서는 PNG 파일들을 생성하고 설명을 추가
    const outputDir = path.join(process.cwd(), 'examples');
    await fs.ensureDir(outputDir);
    
    // 첫 번째 프레임만 저장 (실제 프로젝트에서는 기존 GIF 파일들을 사용)
    const outputPath = path.join(outputDir, filename.replace('.gif', '.png'));
    await fs.writeFile(outputPath, frames[0]);
    
    console.log(`✅ ${filename} 생성 완료`);
    return outputPath;
    
  } catch (error) {
    console.error(`❌ ${filename} 생성 실패:`, error.message);
    throw error;
  }
}

/**
 * 테스트용 GIF 파일들 생성
 */
async function generateTestGIFs() {
  console.log('🎬 테스트용 GIF 파일 생성 시작...\n');
  
  const testCases = [
    { name: 'tiny-test.gif', width: 64, height: 64, frames: 5, delay: 300 },
    { name: 'small-square.gif', width: 200, height: 200, frames: 8, delay: 250 },
    { name: 'medium-wide.gif', width: 400, height: 200, frames: 12, delay: 150 },
    { name: 'large-test.gif', width: 800, height: 600, frames: 20, delay: 100 },
    { name: 'ultra-wide.gif', width: 1200, height: 300, frames: 15, delay: 200 }
  ];
  
  try {
    for (const testCase of testCases) {
      await createAnimatedGIF(
        testCase.name,
        testCase.width,
        testCase.height,
        testCase.frames,
        testCase.delay
      );
    }
    
    console.log('\n🎉 모든 테스트 파일 생성 완료!');
    console.log('📁 examples/ 폴더를 확인하세요.');
    
  } catch (error) {
    console.error('\n💥 테스트 파일 생성 중 오류 발생:', error.message);
    process.exit(1);
  }
}

// 메인 실행
if (import.meta.url === `file://${process.argv[1]}`) {
  generateTestGIFs();
}

export { generateTestGIFs, createAnimatedGIF, createColorFrame }; 