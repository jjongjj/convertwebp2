import pMap from 'p-map';
import fs from 'fs-extra';
import path from 'path';
import { GifToWebPConverter } from './converter.js';

/**
 * 배치 처리 클래스
 * 여러 GIF 파일을 동시에 WebP로 변환
 */
export class BatchProcessor {
  constructor(options = {}) {
    this.options = {
      concurrency: options.concurrency || 4, // 동시 처리 개수
      stopOnError: options.stopOnError || false,
      ...options
    };
    
    this.converter = new GifToWebPConverter(options);
    this.progressCallback = null;
  }

  /**
   * 진행률 콜백 설정
   * @param {Function} callback - 진행률 콜백 함수
   */
  setProgressCallback(callback) {
    this.progressCallback = callback;
  }

  /**
   * 디렉토리에서 GIF 파일 목록 가져오기
   * @param {string} inputDir - 입력 디렉토리
   * @param {boolean} recursive - 재귀 탐색 여부
   * @returns {Promise<string[]>} GIF 파일 경로 배열
   */
  async findGifFiles(inputDir, recursive = false) {
    const gifFiles = [];
    
    try {
      const entries = await fs.readdir(inputDir, { withFileTypes: true });
      
      for (const entry of entries) {
        const fullPath = path.join(inputDir, entry.name);
        
        if (entry.isDirectory() && recursive) {
          const subFiles = await this.findGifFiles(fullPath, recursive);
          gifFiles.push(...subFiles);
        } else if (entry.isFile() && path.extname(entry.name).toLowerCase() === '.gif') {
          gifFiles.push(fullPath);
        }
      }
    } catch (error) {
      console.error(`디렉토리 읽기 실패: ${inputDir}`, error.message);
    }
    
    return gifFiles;
  }

  /**
   * 여러 파일 배치 변환
   * @param {string[]} inputPaths - 입력 파일 경로 배열
   * @param {string} outputDir - 출력 디렉토리
   * @returns {Promise<Object[]>} 변환 결과 배열
   */
  async convertFiles(inputPaths, outputDir) {
    if (!inputPaths || inputPaths.length === 0) {
      throw new Error('변환할 파일이 없습니다.');
    }

    console.log(`🚀 배치 변환 시작: ${inputPaths.length}개 파일`);
    console.log(`📁 출력 디렉토리: ${outputDir}`);
    console.log(`⚡ 동시 처리: ${this.options.concurrency}개`);
    
    // 출력 디렉토리 생성
    await fs.ensureDir(outputDir);
    
    const startTime = Date.now();
    let completed = 0;
    
    // p-map을 사용한 동시 처리
    const results = await pMap(
      inputPaths,
      async (inputPath) => {
        const outputPath = this.converter.generateOutputPath(inputPath, outputDir);
        const result = await this.converter.convertFile(inputPath, outputPath);
        
        completed++;
        
        // 진행률 콜백 호출
        if (this.progressCallback) {
          this.progressCallback({
            completed,
            total: inputPaths.length,
            current: inputPath,
            result
          });
        }
        
        return result;
      },
      {
        concurrency: this.options.concurrency,
        stopOnError: this.options.stopOnError
      }
    );
    
    const totalTime = Date.now() - startTime;
    
    // 최종 통계 출력
    this.printBatchSummary(results, totalTime);
    
    return results;
  }

  /**
   * 디렉토리 전체 변환
   * @param {string} inputDir - 입력 디렉토리
   * @param {string} outputDir - 출력 디렉토리
   * @param {boolean} recursive - 재귀 탐색 여부
   * @returns {Promise<Object[]>} 변환 결과 배열
   */
  async convertDirectory(inputDir, outputDir, recursive = false) {
    console.log(`📂 디렉토리 스캔: ${inputDir}`);
    
    const gifFiles = await this.findGifFiles(inputDir, recursive);
    
    if (gifFiles.length === 0) {
      console.log('❌ GIF 파일을 찾을 수 없습니다.');
      return [];
    }
    
    console.log(`📋 발견된 GIF 파일: ${gifFiles.length}개`);
    
    return await this.convertFiles(gifFiles, outputDir);
  }

  /**
   * 배치 처리 결과 요약 출력
   * @param {Object[]} results - 변환 결과 배열
   * @param {number} totalTime - 총 처리 시간
   */
  printBatchSummary(results, totalTime) {
    const successful = results.filter(r => r.success);
    const failed = results.filter(r => !r.success);
    
    const stats = this.converter.getStats();
    
    console.log('\n🎉 배치 변환 완료!');
    console.log('==================');
    console.log(`✅ 성공: ${successful.length}개`);
    console.log(`❌ 실패: ${failed.length}개`);
    console.log(`⏱️  총 처리시간: ${(totalTime / 1000).toFixed(1)}초`);
    console.log(`📏 총 크기 감소: ${this.converter.formatBytes(stats.totalSaved)}`);
    console.log(`📊 평균 압축률: ${stats.totalCompressionRatio.toFixed(1)}%`);
    
    if (successful.length > 0) {
      const avgTime = successful.reduce((sum, r) => sum + r.processingTime, 0) / successful.length;
      console.log(`⚡ 평균 처리시간: ${avgTime.toFixed(0)}ms/파일`);
    }
    
    if (failed.length > 0) {
      console.log('\n❌ 실패한 파일들:');
      failed.forEach((result, index) => {
        console.log(`   ${index + 1}. ${path.basename(result.inputPath)}: ${result.error}`);
      });
    }
  }

  /**
   * 메모리 사용량 모니터링
   * @returns {Object} 메모리 사용량 정보
   */
  getMemoryUsage() {
    const usage = process.memoryUsage();
    return {
      rss: this.converter.formatBytes(usage.rss),
      heapTotal: this.converter.formatBytes(usage.heapTotal),
      heapUsed: this.converter.formatBytes(usage.heapUsed),
      external: this.converter.formatBytes(usage.external)
    };
  }

  /**
   * 처리 통계 반환
   * @returns {Object} 통계 정보
   */
  getStats() {
    return this.converter.getStats();
  }

  /**
   * 통계 초기화
   */
  resetStats() {
    this.converter.resetStats();
  }
}

export default BatchProcessor; 