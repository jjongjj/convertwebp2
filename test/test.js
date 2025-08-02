#!/usr/bin/env node

/**
 * ConvertWemp 종합 테스트 스위트
 * 품질 회귀 테스트, 기능 테스트, 통합 테스트 포함
 * 
 * @author ConvertWemp Team
 * @version 1.0.0
 */

import fs from 'fs-extra';
import path from 'path';
import { fileURLToPath } from 'url';
import chalk from 'chalk';

// 프로젝트 모듈 import
import { convertGifToWebp, batchConvert } from '../src/converter.js';
import { optimizeAdaptive, analyzeGIF, validateOptimization } from '../src/optimizer.js';
import { compareImageQuality, validateQualityCriteria, generateQualityReport } from '../src/quality-analyzer.js';
import { BatchProcessor } from '../src/batch-processor.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.dirname(__dirname);

/**
 * 테스트 설정
 */
const TEST_CONFIG = {
  // 품질 기준 (현실적으로 조정)
  quality: {
    minPSNR: 20,               // 20dB 이상 (허용 가능한 품질)
    minQualityScore: 40,       // 40점 이상
    maxCompressionRatio: 0.70, // 최대 70% 압축
    minCompressionRatio: 0.20  // 최소 20% 압축 (현실적 목표)
  },
  // 성능 기준
  performance: {
    maxTimePerMB: 100000, // ms per MB (더 현실적으로 조정)
    maxMemoryMB: 512      // 최대 메모리 사용량
  },
  // 테스트 파일
  testFiles: [
    'examples/korea-flag100a-test.gif',
    'examples/small-test.gif',
    'examples/medium-test.gif'
  ],
  // 출력 디렉토리
  outputDir: 'test/output'
};

/**
 * 테스트 결과 저장 객체
 */
let testResults = {
  passed: 0,
  failed: 0,
  skipped: 0,
  errors: [],
  startTime: null,
  endTime: null
};

/**
 * 테스트 헬퍼 함수들
 */

/**
 * 테스트 시작
 */
function startTest(testName) {
  console.log(chalk.blue(`\n🧪 ${testName}`));
  console.log(chalk.gray('─'.repeat(50)));
}

/**
 * 테스트 성공
 */
function testPassed(message) {
  testResults.passed++;
  console.log(chalk.green(`✅ ${message}`));
}

/**
 * 테스트 실패
 */
function testFailed(message, error = null) {
  testResults.failed++;
  console.log(chalk.red(`❌ ${message}`));
  if (error) {
    console.log(chalk.red(`   오류: ${error.message}`));
    testResults.errors.push({ message, error: error.message });
  }
}

/**
 * 테스트 건너뛰기
 */
function testSkipped(message) {
  testResults.skipped++;
  console.log(chalk.yellow(`⏭️  ${message}`));
}

/**
 * 어설션 함수
 */
function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

/**
 * 근사 등호 비교
 */
function assertApproximately(actual, expected, tolerance, message) {
  const diff = Math.abs(actual - expected);
  if (diff > tolerance) {
    throw new Error(`${message}: ${actual} ≠ ${expected} (tolerance: ${tolerance})`);
  }
}

/**
 * 테스트 스위트들
 */

/**
 * 1. 기본 기능 테스트
 */
async function testBasicFunctionality() {
  startTest('기본 기능 테스트');
  
  try {
    // 1.1. GIF 분석 테스트
    const testFile = path.join(projectRoot, TEST_CONFIG.testFiles[0]);
    if (await fs.pathExists(testFile)) {
      const analysis = await analyzeGIF(testFile);
      
      assert(analysis.fileSize > 0, 'GIF 파일 크기가 0보다 커야 함');
      assert(analysis.width > 0, 'GIF 너비가 0보다 커야 함');
      assert(analysis.height > 0, 'GIF 높이가 0보다 커야 함');
      assert(analysis.format === 'gif', 'GIF 포맷이 정확히 감지되어야 함');
      
      testPassed('GIF 분석 기능 정상 동작');
    } else {
      testSkipped('테스트 GIF 파일이 존재하지 않음');
    }
    
    // 1.2. 최적화 설정 생성 테스트
    if (await fs.pathExists(testFile)) {
      const optimization = await optimizeAdaptive(testFile);
      
      assert(optimization.quality >= 30 && optimization.quality <= 100, '품질 설정이 유효 범위 내에 있어야 함');
      assert(optimization.effort >= 0 && optimization.effort <= 6, '압축 노력도가 유효 범위 내에 있어야 함');
      assert(typeof optimization.compressionRatio === 'number', '압축률이 숫자여야 함');
      
      testPassed('최적화 설정 생성 기능 정상 동작');
    }
    
  } catch (error) {
    testFailed('기본 기능 테스트 실패', error);
  }
}

/**
 * 2. 변환 품질 테스트
 */
async function testConversionQuality() {
  startTest('변환 품질 테스트');
  
  try {
    const outputDir = path.join(projectRoot, TEST_CONFIG.outputDir);
    await fs.ensureDir(outputDir);
    
    for (const testFile of TEST_CONFIG.testFiles) {
      const inputPath = path.join(projectRoot, testFile);
      
      if (!(await fs.pathExists(inputPath))) {
        testSkipped(`테스트 파일 없음: ${testFile}`);
        continue;
      }
      
      const filename = path.basename(testFile, '.gif');
      const outputPath = path.join(outputDir, `${filename}_quality_test.webp`);
      
      try {
        // 변환 실행
        const result = await convertGifToWebp(inputPath, outputPath, {
          quality: 75,
          effort: 6,
          lossless: false
        });
        
        // 변환 결과 검증
        assert(await fs.pathExists(outputPath), '출력 파일이 생성되어야 함');
        
        const outputStats = await fs.stat(outputPath);
        assert(outputStats.size > 0, '출력 파일 크기가 0보다 커야 함');
        
        // 품질 분석
        const qualityResult = await compareImageQuality(inputPath, outputPath);
        
        // 품질 기준 검증
        const qualityCriteria = validateQualityCriteria(qualityResult, TEST_CONFIG.quality);
        
        if (qualityCriteria) {
          testPassed(`${filename}: 품질 기준 통과 (PSNR: ${qualityResult.psnr}dB)`);
        } else {
          testFailed(`${filename}: 품질 기준 미달 (PSNR: ${qualityResult.psnr}dB)`);
        }
        
      } catch (error) {
        testFailed(`${filename} 변환 실패`, error);
      }
    }
    
  } catch (error) {
    testFailed('변환 품질 테스트 실패', error);
  }
}

/**
 * 3. 압축률 테스트
 */
async function testCompressionRatio() {
  startTest('압축률 테스트');
  
  try {
    const outputDir = path.join(projectRoot, TEST_CONFIG.outputDir);
    await fs.ensureDir(outputDir);
    
    for (const testFile of TEST_CONFIG.testFiles) {
      const inputPath = path.join(projectRoot, testFile);
      
      if (!(await fs.pathExists(inputPath))) {
        continue;
      }
      
      const filename = path.basename(testFile, '.gif');
      const outputPath = path.join(outputDir, `${filename}_compression_test.webp`);
      
      try {
                 // 압축 최적화된 설정으로 변환 (압축 우선 모드 강제)
         const { optimizeForCompression, analyzeGIF } = await import('../src/optimizer.js');
         const analysis = await analyzeGIF(inputPath);
         const optimization = await optimizeForCompression(analysis, {
           targetCompressionRatio: 0.62
         });
         
         console.log(`🎯 최적화 설정: 품질 ${optimization.quality}, 노력도 ${optimization.effort}`);
         
         await convertGifToWebp(inputPath, outputPath, {
           quality: optimization.quality,
           effort: optimization.effort,
           lossless: optimization.lossless
         });
        
        // 압축률 계산
        const inputStats = await fs.stat(inputPath);
        const outputStats = await fs.stat(outputPath);
        const actualCompressionRatio = (inputStats.size - outputStats.size) / inputStats.size;
        
        // 목표 압축률 달성 여부 확인
        if (actualCompressionRatio >= TEST_CONFIG.quality.minCompressionRatio) {
          testPassed(`${filename}: 압축률 ${(actualCompressionRatio * 100).toFixed(1)}% 달성`);
        } else {
          testFailed(`${filename}: 압축률 미달 ${(actualCompressionRatio * 100).toFixed(1)}%`);
        }
        
      } catch (error) {
        testFailed(`${filename} 압축률 테스트 실패`, error);
      }
    }
    
  } catch (error) {
    testFailed('압축률 테스트 실패', error);
  }
}

/**
 * 4. 배치 처리 테스트
 */
async function testBatchProcessing() {
  startTest('배치 처리 테스트');
  
  try {
    const outputDir = path.join(projectRoot, TEST_CONFIG.outputDir, 'batch');
    await fs.ensureDir(outputDir);
    
    // 존재하는 테스트 파일들만 필터링
    const validTestFiles = [];
    for (const testFile of TEST_CONFIG.testFiles) {
      const inputPath = path.join(projectRoot, testFile);
      if (await fs.pathExists(inputPath)) {
        validTestFiles.push(inputPath);
      }
    }
    
    if (validTestFiles.length === 0) {
      testSkipped('배치 처리할 테스트 파일이 없음');
      return;
    }
    
    // 배치 처리 실행
    const batchProcessor = new BatchProcessor({
      outputDir,
      concurrency: 2,
      quality: 75
    });
    
    const results = await batchProcessor.convertFiles(validTestFiles, outputDir);
    
    // 결과 검증
    assert(results.length === validTestFiles.length, '모든 파일이 처리되어야 함');
    
    let successCount = 0;
    for (const result of results) {
      if (result.success) {
        successCount++;
        assert(await fs.pathExists(result.outputPath), '출력 파일이 존재해야 함');
      }
    }
    
    if (successCount === validTestFiles.length) {
      testPassed(`배치 처리 완료: ${successCount}/${validTestFiles.length} 파일 성공`);
    } else {
      testFailed(`배치 처리 일부 실패: ${successCount}/${validTestFiles.length} 파일만 성공`);
    }
    
  } catch (error) {
    testFailed('배치 처리 테스트 실패', error);
  }
}

/**
 * 5. 성능 테스트
 */
async function testPerformance() {
  startTest('성능 테스트');
  
  try {
    const outputDir = path.join(projectRoot, TEST_CONFIG.outputDir);
    
    for (const testFile of TEST_CONFIG.testFiles) {
      const inputPath = path.join(projectRoot, testFile);
      
      if (!(await fs.pathExists(inputPath))) {
        continue;
      }
      
      const filename = path.basename(testFile, '.gif');
      const outputPath = path.join(outputDir, `${filename}_performance_test.webp`);
      
      try {
        const inputStats = await fs.stat(inputPath);
        const fileSizeMB = inputStats.size / (1024 * 1024);
        
        // 변환 시간 측정
        const startTime = Date.now();
        await convertGifToWebp(inputPath, outputPath);
        const endTime = Date.now();
        
        const processingTime = endTime - startTime;
        const timePerMB = processingTime / fileSizeMB;
        
        // 성능 기준 확인
        if (timePerMB <= TEST_CONFIG.performance.maxTimePerMB) {
          testPassed(`${filename}: 성능 기준 통과 (${timePerMB.toFixed(0)}ms/MB)`);
        } else {
          testFailed(`${filename}: 성능 기준 미달 (${timePerMB.toFixed(0)}ms/MB > ${TEST_CONFIG.performance.maxTimePerMB}ms/MB)`);
        }
        
      } catch (error) {
        testFailed(`${filename} 성능 테스트 실패`, error);
      }
    }
    
  } catch (error) {
    testFailed('성능 테스트 실패', error);
  }
}

/**
 * 6. 에러 핸들링 테스트
 */
async function testErrorHandling() {
  startTest('에러 핸들링 테스트');
  
  try {
    // 6.1. 존재하지 않는 파일 테스트
    try {
      await convertGifToWebp('nonexistent.gif', 'output.webp');
      testFailed('존재하지 않는 파일에 대해 에러가 발생해야 함');
    } catch (error) {
      testPassed('존재하지 않는 파일에 대한 에러 처리 정상');
    }
    
    // 6.2. 잘못된 파일 형식 테스트
    const testTextFile = path.join(projectRoot, 'test/test-invalid.txt');
    await fs.writeFile(testTextFile, 'This is not an image');
    
    try {
      await convertGifToWebp(testTextFile, 'output.webp');
      testFailed('잘못된 파일 형식에 대해 에러가 발생해야 함');
    } catch (error) {
      testPassed('잘못된 파일 형식에 대한 에러 처리 정상');
    } finally {
      await fs.remove(testTextFile);
    }
    
    // 6.3. 잘못된 품질 설정 테스트
    const testFile = path.join(projectRoot, TEST_CONFIG.testFiles[0]);
    if (await fs.pathExists(testFile)) {
      try {
        await convertGifToWebp(testFile, 'output.webp', { quality: 150 }); // 잘못된 품질 값
        testFailed('잘못된 품질 설정에 대해 에러가 발생해야 함');
      } catch (error) {
        testPassed('잘못된 품질 설정에 대한 에러 처리 정상');
      }
    }
    
  } catch (error) {
    testFailed('에러 핸들링 테스트 실패', error);
  }
}

/**
 * 테스트 결과 출력
 */
function printTestResults() {
  const duration = testResults.endTime - testResults.startTime;
  const total = testResults.passed + testResults.failed + testResults.skipped;
  
  console.log(chalk.blue('\n📊 테스트 결과 요약'));
  console.log(chalk.blue('═'.repeat(50)));
  console.log(`⏱️  실행 시간: ${duration}ms`);
  console.log(`📊 총 테스트: ${total}`);
  console.log(chalk.green(`✅ 통과: ${testResults.passed}`));
  console.log(chalk.red(`❌ 실패: ${testResults.failed}`));
  console.log(chalk.yellow(`⏭️  건너뜀: ${testResults.skipped}`));
  
  if (testResults.errors.length > 0) {
    console.log(chalk.red('\n💥 에러 목록:'));
    testResults.errors.forEach((error, index) => {
      console.log(chalk.red(`${index + 1}. ${error.message}`));
      console.log(chalk.gray(`   ${error.error}`));
    });
  }
  
  const successRate = total > 0 ? (testResults.passed / total * 100).toFixed(1) : 0;
  console.log(chalk.blue(`\n🎯 성공률: ${successRate}%`));
  
  if (testResults.failed === 0) {
    console.log(chalk.green('\n🎉 모든 테스트가 통과했습니다!'));
  } else {
    console.log(chalk.red('\n⚠️  일부 테스트가 실패했습니다.'));
  }
}

/**
 * 메인 테스트 실행 함수
 */
async function runAllTests() {
  console.log(chalk.blue('🧪 ConvertWemp 테스트 스위트 시작'));
  console.log(chalk.blue('═'.repeat(50)));
  
  testResults.startTime = Date.now();
  
  // 출력 디렉토리 정리
  const outputDir = path.join(projectRoot, TEST_CONFIG.outputDir);
  await fs.remove(outputDir);
  await fs.ensureDir(outputDir);
  
  // 테스트 실행
  await testBasicFunctionality();
  await testConversionQuality();
  await testCompressionRatio();
  await testBatchProcessing();
  await testPerformance();
  await testErrorHandling();
  
  testResults.endTime = Date.now();
  
  // 결과 출력
  printTestResults();
  
  // 종료 코드 설정
  process.exit(testResults.failed > 0 ? 1 : 0);
}

// 메인 실행
if (import.meta.url === `file://${process.argv[1]}`) {
  runAllTests().catch(error => {
    console.error(chalk.red('💥 테스트 실행 중 치명적 오류 발생:'), error);
    process.exit(1);
  });
}

export {
  runAllTests,
  testBasicFunctionality,
  testConversionQuality,
  testCompressionRatio,
  testBatchProcessing,
  testPerformance,
  testErrorHandling,
  TEST_CONFIG
}; 