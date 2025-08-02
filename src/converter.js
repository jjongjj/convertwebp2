#!/usr/bin/env node

import sharp from 'sharp';
import fs from 'fs-extra';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * GIF to WebP 변환기 클래스
 * Sharp 라이브러리를 사용하여 고성능 이미지 변환 수행
 */
export class GifToWebPConverter {
  constructor(options = {}) {
    this.options = {
      quality: options.quality || 75,
      effort: options.effort || 6,
      lossless: options.lossless || false,
      loop: options.loop || 0,
      force: options.force !== false,
      ...options
    };
    
    this.stats = {
      processed: 0,
      failed: 0,
      totalSizeBefore: 0,
      totalSizeAfter: 0
    };
  }

  /**
   * 단일 GIF 파일을 WebP로 변환
   * @param {string} inputPath - 입력 GIF 파일 경로
   * @param {string} outputPath - 출력 WebP 파일 경로
   * @returns {Promise<Object>} 변환 결과 정보
   */
  async convertFile(inputPath, outputPath) {
    try {
      console.log(`🔄 변환 시작: ${path.basename(inputPath)}`);
      
      // 입력 파일 검증
      await this.validateInputFile(inputPath);
      
      // 출력 디렉토리 생성
      await fs.ensureDir(path.dirname(outputPath));
      
      const startTime = Date.now();
      const inputStats = await fs.stat(inputPath);
      
      // Sharp를 사용한 GIF → WebP 변환
      const webpBuffer = await sharp(inputPath, {
        animated: true,
        limitInputPixels: false
      })
        .webp({
          quality: this.options.quality,
          effort: this.options.effort,
          lossless: this.options.lossless,
          loop: this.options.loop,
          force: this.options.force
        })
        .toBuffer();

      // 변환된 파일 저장
      await fs.writeFile(outputPath, webpBuffer);
      
      const outputStats = await fs.stat(outputPath);
      const processingTime = Date.now() - startTime;
      
      // 압축률 계산
      const compressionRatio = ((inputStats.size - outputStats.size) / inputStats.size) * 100;
      
      // 통계 업데이트
      this.updateStats(inputStats.size, outputStats.size, true);
      
      const result = {
        success: true,
        inputPath,
        outputPath,
        inputSize: inputStats.size,
        outputSize: outputStats.size,
        compressionRatio,
        processingTime,
        savedBytes: inputStats.size - outputStats.size
      };
      
      console.log(`✅ 변환 완료: ${path.basename(inputPath)}`);
      console.log(`   📏 크기: ${this.formatBytes(inputStats.size)} → ${this.formatBytes(outputStats.size)}`);
      console.log(`   📊 압축률: ${compressionRatio.toFixed(1)}%`);
      console.log(`   ⏱️  처리시간: ${processingTime}ms`);
      
      return result;
      
    } catch (error) {
      console.error(`❌ 변환 실패: ${path.basename(inputPath)}`);
      console.error(`   오류: ${error.message}`);
      
      this.updateStats(0, 0, false);
      
      return {
        success: false,
        inputPath,
        error: error.message,
        processingTime: 0
      };
    }
  }

  /**
   * 입력 파일 유효성 검사
   * @param {string} inputPath - 검사할 파일 경로
   */
  async validateInputFile(inputPath) {
    // 파일 존재 확인
    if (!await fs.pathExists(inputPath)) {
      throw new Error(`파일을 찾을 수 없습니다: ${inputPath}`);
    }
    
    // GIF 파일 확인
    const ext = path.extname(inputPath).toLowerCase();
    if (ext !== '.gif') {
      throw new Error(`GIF 파일이 아닙니다: ${ext}`);
    }
    
    // 파일 크기 확인 (100MB 제한)
    const stats = await fs.stat(inputPath);
    const maxSize = 100 * 1024 * 1024; // 100MB
    if (stats.size > maxSize) {
      throw new Error(`파일이 너무 큽니다: ${this.formatBytes(stats.size)} (최대 ${this.formatBytes(maxSize)})`);
    }
  }

  /**
   * 출력 파일 경로 생성
   * @param {string} inputPath - 입력 파일 경로
   * @param {string} outputDir - 출력 디렉토리 (선택사항)
   * @returns {string} 출력 파일 경로
   */
  generateOutputPath(inputPath, outputDir = null) {
    const inputFileName = path.basename(inputPath, path.extname(inputPath));
    const outputFileName = `${inputFileName}.webp`;
    
    if (outputDir) {
      return path.join(outputDir, outputFileName);
    } else {
      return path.join(path.dirname(inputPath), outputFileName);
    }
  }

  /**
   * 통계 업데이트
   * @param {number} inputSize - 입력 파일 크기
   * @param {number} outputSize - 출력 파일 크기
   * @param {boolean} success - 성공 여부
   */
  updateStats(inputSize, outputSize, success) {
    if (success) {
      this.stats.processed++;
      this.stats.totalSizeBefore += inputSize;
      this.stats.totalSizeAfter += outputSize;
    } else {
      this.stats.failed++;
    }
  }

  /**
   * 전체 변환 통계 반환
   * @returns {Object} 통계 정보
   */
  getStats() {
    const totalCompressionRatio = this.stats.totalSizeBefore > 0 
      ? ((this.stats.totalSizeBefore - this.stats.totalSizeAfter) / this.stats.totalSizeBefore) * 100
      : 0;
    
    return {
      ...this.stats,
      totalCompressionRatio,
      totalSaved: this.stats.totalSizeBefore - this.stats.totalSizeAfter
    };
  }

  /**
   * 통계 초기화
   */
  resetStats() {
    this.stats = {
      processed: 0,
      failed: 0,
      totalSizeBefore: 0,
      totalSizeAfter: 0
    };
  }

  /**
   * 바이트를 사람이 읽기 쉬운 형태로 변환
   * @param {number} bytes - 바이트 수
   * @returns {string} 포맷된 문자열
   */
  formatBytes(bytes) {
    if (bytes === 0) return '0 Bytes';
    
    const k = 1024;
    const decimals = 2;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    
    return parseFloat((bytes / Math.pow(k, i)).toFixed(decimals)) + ' ' + sizes[i];
  }

  /**
   * Sharp 라이브러리 정보 출력
   */
  static async getSharpInfo() {
    try {
      const info = sharp.format;
      console.log('📚 Sharp 라이브러리 정보:');
      console.log(`   WebP 지원: ${info.webp ? '✅' : '❌'}`);
      console.log(`   GIF 지원: ${info.gif ? '✅' : '❌'}`);
      console.log(`   애니메이션 지원: ${info.webp?.output?.animated ? '✅' : '❌'}`);
      
      const sharpVersion = sharp.versions;
      console.log(`   Sharp 버전: ${sharpVersion.sharp}`);
      console.log(`   libvips 버전: ${sharpVersion.vips}`);
      
      return info;
    } catch (error) {
      console.error('Sharp 정보를 가져올 수 없습니다:', error.message);
      return null;
    }
  }
}

export default GifToWebPConverter; 