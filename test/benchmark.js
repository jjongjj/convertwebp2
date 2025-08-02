#!/usr/bin/env node

/**
 * ConvertWemp 성능 벤치마크 스위트
 * ImageMagick 대비 성능 비교 및 다양한 시나리오 벤치마크
 * 
 * @author ConvertWemp Team
 * @version 1.0.0
 */

import fs from 'fs-extra';
import path from 'path';
import { fileURLToPath } from 'url';
import { exec } from 'child_process';
import { promisify } from 'util';
import chalk from 'chalk';
import os from 'os';

// 프로젝트 모듈 import
import { convertGifToWebp } from '../src/converter.js';
import { BatchProcessor } from '../src/batch-processor.js';
import { optimizeAdaptive } from '../src/optimizer.js';

const execAsync = promisify(exec);
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.dirname(__dirname);

/**
 * 벤치마크 설정
 */
const BENCHMARK_CONFIG = {
  // 테스트 파일들
  testFiles: [
    'examples/korea-flag100a-test.gif',
    'examples/small-test.gif',
    'examples/medium-test.gif'
  ],
  // 반복 횟수
  iterations: 3,
  // 출력 디렉토리
  outputDir: 'test/benchmark_output',
  // ImageMagick 명령어 템플릿
  imageMagickCmd: 'magick convert "{input}" -quality {quality} "{output}"',
  // 품질 설정들
  qualityLevels: [60, 75, 90],
  // 동시 처리 레벨들
  concurrencyLevels: [1, 2, 4, 8]
};

/**
 * 벤치마크 결과 저장 객체
 */
let benchmarkResults = {
  systemInfo: null,
  tests: [],
  summary: null
};

/**
 * 시스템 정보 수집
 */
function collectSystemInfo() {
  return {
    platform: os.platform(),
    arch: os.arch(),
    cpus: os.cpus().length,
    totalMemory: Math.round(os.totalmem() / 1024 / 1024 / 1024), // GB
    freeMemory: Math.round(os.freemem() / 1024 / 1024 / 1024), // GB
    nodeVersion: process.version,
    timestamp: new Date().toISOString()
  };
}

/**
 * 실행 시간 측정 데코레이터
 */
async function measureTime(fn, label = '') {
  const startTime = process.hrtime.bigint();
  const startMemory = process.memoryUsage();
  
  try {
    const result = await fn();
    const endTime = process.hrtime.bigint();
    const endMemory = process.memoryUsage();
    
    const duration = Number(endTime - startTime) / 1000000; // ms로 변환
    const memoryDelta = endMemory.heapUsed - startMemory.heapUsed;
    
    return {
      result,
      performance: {
        duration,
        memoryUsed: memoryDelta,
        startMemory: startMemory.heapUsed,
        endMemory: endMemory.heapUsed
      }
    };
  } catch (error) {
    const endTime = process.hrtime.bigint();
    const duration = Number(endTime - startTime) / 1000000;
    
    return {
      result: null,
      error: error.message,
      performance: {
        duration,
        failed: true
      }
    };
  }
}

/**
 * ImageMagick 가용성 확인
 */
async function checkImageMagickAvailability() {
  try {
    await execAsync('magick -version');
    return true;
  } catch (error) {
    try {
      await execAsync('convert -version');
      return true;
    } catch (error2) {
      return false;
    }
  }
}

/**
 * ImageMagick으로 변환
 */
async function convertWithImageMagick(inputPath, outputPath, quality = 75) {
  const cmd = BENCHMARK_CONFIG.imageMagickCmd
    .replace('{input}', inputPath)
    .replace('{output}', outputPath)
    .replace('{quality}', quality);
  
  try {
    await execAsync(cmd);
    return true;
  } catch (error) {
    throw new Error(`ImageMagick 변환 실패: ${error.message}`);
  }
}

/**
 * 단일 파일 변환 벤치마크
 */
async function benchmarkSingleFileConversion() {
  console.log(chalk.blue('\n📊 단일 파일 변환 벤치마크'));
  console.log(chalk.gray('─'.repeat(50)));
  
  const results = [];
  const outputDir = path.join(projectRoot, BENCHMARK_CONFIG.outputDir, 'single');
  await fs.ensureDir(outputDir);
  
  const imageMagickAvailable = await checkImageMagickAvailability();
  
  for (const testFile of BENCHMARK_CONFIG.testFiles) {
    const inputPath = path.join(projectRoot, testFile);
    
    if (!(await fs.pathExists(inputPath))) {
      console.log(chalk.yellow(`⏭️  건너뜀: ${testFile} (파일 없음)`));
      continue;
    }
    
    const filename = path.basename(testFile, '.gif');
    console.log(chalk.cyan(`\n🔄 테스트 중: ${filename}`));
    
    const inputStats = await fs.stat(inputPath);
    const fileSizeMB = inputStats.size / (1024 * 1024);
    
    const testResult = {
      file: filename,
      inputSize: inputStats.size,
      fileSizeMB: fileSizeMB.toFixed(2),
      sharp: {},
      imageMagick: {}
    };
    
    // Sharp (ConvertWemp) 벤치마크
    for (let iteration = 0; iteration < BENCHMARK_CONFIG.iterations; iteration++) {
      const outputPath = path.join(outputDir, `${filename}_sharp_${iteration}.webp`);
      
      const { performance } = await measureTime(async () => {
        return await convertGifToWebp(inputPath, outputPath, {
          quality: 75,
          effort: 6
        });
      });
      
      if (!testResult.sharp.durations) {
        testResult.sharp.durations = [];
        testResult.sharp.memoryUsage = [];
      }
      
      testResult.sharp.durations.push(performance.duration);
      testResult.sharp.memoryUsage.push(performance.memoryUsed);
      
      if (await fs.pathExists(outputPath)) {
        const outputStats = await fs.stat(outputPath);
        testResult.sharp.outputSize = outputStats.size;
      }
    }
    
    // ImageMagick 벤치마크 (가능한 경우)
    if (imageMagickAvailable) {
      for (let iteration = 0; iteration < BENCHMARK_CONFIG.iterations; iteration++) {
        const outputPath = path.join(outputDir, `${filename}_magick_${iteration}.webp`);
        
        const { performance } = await measureTime(async () => {
          return await convertWithImageMagick(inputPath, outputPath, 75);
        });
        
        if (!testResult.imageMagick.durations) {
          testResult.imageMagick.durations = [];
        }
        
        testResult.imageMagick.durations.push(performance.duration);
        
        if (await fs.pathExists(outputPath)) {
          const outputStats = await fs.stat(outputPath);
          testResult.imageMagick.outputSize = outputStats.size;
        }
      }
    } else {
      testResult.imageMagick.unavailable = true;
    }
    
    // 평균 계산
    testResult.sharp.avgDuration = testResult.sharp.durations.reduce((a, b) => a + b, 0) / testResult.sharp.durations.length;
    testResult.sharp.avgMemory = testResult.sharp.memoryUsage.reduce((a, b) => a + b, 0) / testResult.sharp.memoryUsage.length;
    testResult.sharp.throughput = fileSizeMB / (testResult.sharp.avgDuration / 1000); // MB/s
    
    if (!testResult.imageMagick.unavailable) {
      testResult.imageMagick.avgDuration = testResult.imageMagick.durations.reduce((a, b) => a + b, 0) / testResult.imageMagick.durations.length;
      testResult.imageMagick.throughput = fileSizeMB / (testResult.imageMagick.avgDuration / 1000); // MB/s
      testResult.speedupRatio = testResult.imageMagick.avgDuration / testResult.sharp.avgDuration;
    }
    
    results.push(testResult);
    
    // 결과 출력
    console.log(chalk.green(`  Sharp: ${testResult.sharp.avgDuration.toFixed(1)}ms (${testResult.sharp.throughput.toFixed(2)} MB/s)`));
    if (!testResult.imageMagick.unavailable) {
      console.log(chalk.blue(`  ImageMagick: ${testResult.imageMagick.avgDuration.toFixed(1)}ms (${testResult.imageMagick.throughput.toFixed(2)} MB/s)`));
      console.log(chalk.yellow(`  속도 향상: ${testResult.speedupRatio.toFixed(2)}x`));
    } else {
      console.log(chalk.yellow('  ImageMagick: 사용 불가'));
    }
  }
  
  return results;
}

/**
 * 배치 처리 벤치마크
 */
async function benchmarkBatchProcessing() {
  console.log(chalk.blue('\n📊 배치 처리 벤치마크'));
  console.log(chalk.gray('─'.repeat(50)));
  
  const results = [];
  const outputDir = path.join(projectRoot, BENCHMARK_CONFIG.outputDir, 'batch');
  await fs.ensureDir(outputDir);
  
  // 존재하는 파일들만 필터링
  const validFiles = [];
  for (const testFile of BENCHMARK_CONFIG.testFiles) {
    const inputPath = path.join(projectRoot, testFile);
    if (await fs.pathExists(inputPath)) {
      validFiles.push(inputPath);
    }
  }
  
  if (validFiles.length === 0) {
    console.log(chalk.yellow('⏭️  배치 처리할 파일이 없음'));
    return [];
  }
  
  for (const concurrency of BENCHMARK_CONFIG.concurrencyLevels) {
    console.log(chalk.cyan(`\n🔄 동시 처리 수: ${concurrency}`));
    
    const batchOutputDir = path.join(outputDir, `concurrency_${concurrency}`);
    await fs.ensureDir(batchOutputDir);
    
    const { performance } = await measureTime(async () => {
      const processor = new BatchProcessor({
        outputDir: batchOutputDir,
        concurrency,
        quality: 75
      });
      
      return await processor.processFiles(validFiles);
    });
    
    const totalSize = (await Promise.all(
      validFiles.map(async file => (await fs.stat(file)).size)
    )).reduce((a, b) => a + b, 0);
    
    const totalSizeMB = totalSize / (1024 * 1024);
    const throughput = totalSizeMB / (performance.duration / 1000);
    
    const result = {
      concurrency,
      fileCount: validFiles.length,
      totalSizeMB: totalSizeMB.toFixed(2),
      duration: performance.duration,
      throughput: throughput.toFixed(2),
      memoryUsed: performance.memoryUsed
    };
    
    results.push(result);
    
    console.log(chalk.green(`  처리 시간: ${performance.duration.toFixed(1)}ms`));
    console.log(chalk.green(`  처리량: ${throughput.toFixed(2)} MB/s`));
    console.log(chalk.green(`  메모리 사용: ${(performance.memoryUsed / 1024 / 1024).toFixed(1)} MB`));
  }
  
  return results;
}

/**
 * 품질별 성능 벤치마크
 */
async function benchmarkQualityLevels() {
  console.log(chalk.blue('\n📊 품질별 성능 벤치마크'));
  console.log(chalk.gray('─'.repeat(50)));
  
  const results = [];
  const outputDir = path.join(projectRoot, BENCHMARK_CONFIG.outputDir, 'quality');
  await fs.ensureDir(outputDir);
  
  const testFile = BENCHMARK_CONFIG.testFiles.find(file => 
    fs.pathExistsSync(path.join(projectRoot, file))
  );
  
  if (!testFile) {
    console.log(chalk.yellow('⏭️  품질 테스트할 파일이 없음'));
    return [];
  }
  
  const inputPath = path.join(projectRoot, testFile);
  const filename = path.basename(testFile, '.gif');
  
  for (const quality of BENCHMARK_CONFIG.qualityLevels) {
    console.log(chalk.cyan(`\n🔄 품질 설정: ${quality}`));
    
    const outputPath = path.join(outputDir, `${filename}_quality_${quality}.webp`);
    
    const { performance } = await measureTime(async () => {
      return await convertGifToWebp(inputPath, outputPath, {
        quality,
        effort: 6
      });
    });
    
    let outputSize = 0;
    if (await fs.pathExists(outputPath)) {
      const outputStats = await fs.stat(outputPath);
      outputSize = outputStats.size;
    }
    
    const inputStats = await fs.stat(inputPath);
    const compressionRatio = (inputStats.size - outputSize) / inputStats.size;
    
    const result = {
      quality,
      duration: performance.duration,
      inputSize: inputStats.size,
      outputSize,
      compressionRatio: (compressionRatio * 100).toFixed(1),
      memoryUsed: performance.memoryUsed
    };
    
    results.push(result);
    
    console.log(chalk.green(`  처리 시간: ${performance.duration.toFixed(1)}ms`));
    console.log(chalk.green(`  압축률: ${result.compressionRatio}%`));
    console.log(chalk.green(`  출력 크기: ${(outputSize / 1024).toFixed(1)} KB`));
  }
  
  return results;
}

/**
 * 최적화 알고리즘 벤치마크
 */
async function benchmarkOptimizationAlgorithms() {
  console.log(chalk.blue('\n📊 최적화 알고리즘 벤치마크'));
  console.log(chalk.gray('─'.repeat(50)));
  
  const results = [];
  const outputDir = path.join(projectRoot, BENCHMARK_CONFIG.outputDir, 'optimization');
  await fs.ensureDir(outputDir);
  
  for (const testFile of BENCHMARK_CONFIG.testFiles) {
    const inputPath = path.join(projectRoot, testFile);
    
    if (!(await fs.pathExists(inputPath))) {
      continue;
    }
    
    const filename = path.basename(testFile, '.gif');
    console.log(chalk.cyan(`\n🔄 최적화 테스트: ${filename}`));
    
    // 최적화 설정 계산 시간 측정
    const { result: optimization, performance: optimizationPerf } = await measureTime(async () => {
      return await optimizeAdaptive(inputPath);
    });
    
    // 최적화된 설정으로 변환 시간 측정
    const outputPath = path.join(outputDir, `${filename}_optimized.webp`);
    const { performance: conversionPerf } = await measureTime(async () => {
      return await convertGifToWebp(inputPath, outputPath, {
        quality: optimization.quality,
        effort: optimization.effort,
        lossless: optimization.lossless
      });
    });
    
    let outputSize = 0;
    if (await fs.pathExists(outputPath)) {
      const outputStats = await fs.stat(outputPath);
      outputSize = outputStats.size;
    }
    
    const inputStats = await fs.stat(inputPath);
    const actualCompressionRatio = (inputStats.size - outputSize) / inputStats.size;
    
    const result = {
      file: filename,
      optimizationTime: optimizationPerf.duration,
      conversionTime: conversionPerf.duration,
      totalTime: optimizationPerf.duration + conversionPerf.duration,
      predictedCompression: (optimization.compressionRatio * 100).toFixed(1),
      actualCompression: (actualCompressionRatio * 100).toFixed(1),
      optimizedQuality: optimization.quality,
      strategy: optimization.metadata.selectedStrategy
    };
    
    results.push(result);
    
    console.log(chalk.green(`  최적화 시간: ${optimizationPerf.duration.toFixed(1)}ms`));
    console.log(chalk.green(`  변환 시간: ${conversionPerf.duration.toFixed(1)}ms`));
    console.log(chalk.green(`  전체 시간: ${result.totalTime.toFixed(1)}ms`));
    console.log(chalk.green(`  예상/실제 압축률: ${result.predictedCompression}% / ${result.actualCompression}%`));
    console.log(chalk.green(`  최적화 전략: ${result.strategy}`));
  }
  
  return results;
}

/**
 * 벤치마크 결과 요약 생성
 */
function generateBenchmarkSummary(allResults) {
  const summary = {
    timestamp: new Date().toISOString(),
    systemInfo: benchmarkResults.systemInfo,
    performance: {},
    recommendations: []
  };
  
  // 단일 파일 변환 성능 요약
  const singleFileResults = allResults.singleFile || [];
  if (singleFileResults.length > 0) {
    const avgSpeedups = singleFileResults
      .filter(r => r.speedupRatio)
      .map(r => r.speedupRatio);
    
    if (avgSpeedups.length > 0) {
      summary.performance.avgSpeedupVsImageMagick = (
        avgSpeedups.reduce((a, b) => a + b, 0) / avgSpeedups.length
      ).toFixed(2);
    }
    
    const avgThroughput = singleFileResults
      .map(r => r.sharp.throughput)
      .reduce((a, b) => a + b, 0) / singleFileResults.length;
    
    summary.performance.avgThroughput = avgThroughput.toFixed(2);
  }
  
  // 배치 처리 성능 요약
  const batchResults = allResults.batch || [];
  if (batchResults.length > 0) {
    const bestConcurrency = batchResults.reduce((best, current) => 
      parseFloat(current.throughput) > parseFloat(best.throughput) ? current : best
    );
    
    summary.performance.optimalConcurrency = bestConcurrency.concurrency;
    summary.performance.maxBatchThroughput = bestConcurrency.throughput;
  }
  
  // 권장사항 생성
  if (summary.performance.avgSpeedupVsImageMagick) {
    const speedup = parseFloat(summary.performance.avgSpeedupVsImageMagick);
    if (speedup >= 4) {
      summary.recommendations.push(`🎉 목표 달성: ImageMagick 대비 ${speedup}x 속도 향상`);
    } else {
      summary.recommendations.push(`⚠️  성능 개선 필요: ImageMagick 대비 ${speedup}x (목표: 4x 이상)`);
    }
  }
  
  if (summary.performance.optimalConcurrency) {
    summary.recommendations.push(`💡 최적 동시 처리 수: ${summary.performance.optimalConcurrency}`);
  }
  
  const totalMemory = benchmarkResults.systemInfo.totalMemory;
  if (totalMemory < 8) {
    summary.recommendations.push('⚠️  메모리가 부족할 수 있습니다. 동시 처리 수를 줄이는 것을 권장합니다.');
  }
  
  return summary;
}

/**
 * 벤치마크 결과 출력
 */
function printBenchmarkResults(results, summary) {
  console.log(chalk.blue('\n📊 벤치마크 결과 요약'));
  console.log(chalk.blue('═'.repeat(60)));
  
  // 시스템 정보
  console.log(chalk.cyan('\n🖥️  시스템 정보:'));
  console.log(`   플랫폼: ${summary.systemInfo.platform} ${summary.systemInfo.arch}`);
  console.log(`   CPU 코어: ${summary.systemInfo.cpus}개`);
  console.log(`   메모리: ${summary.systemInfo.totalMemory}GB (사용 가능: ${summary.systemInfo.freeMemory}GB)`);
  console.log(`   Node.js: ${summary.systemInfo.nodeVersion}`);
  
  // 성능 요약
  console.log(chalk.cyan('\n⚡ 성능 요약:'));
  if (summary.performance.avgSpeedupVsImageMagick) {
    console.log(`   평균 속도 향상: ${summary.performance.avgSpeedupVsImageMagick}x (vs ImageMagick)`);
  }
  if (summary.performance.avgThroughput) {
    console.log(`   평균 처리량: ${summary.performance.avgThroughput} MB/s`);
  }
  if (summary.performance.optimalConcurrency) {
    console.log(`   최적 동시 처리: ${summary.performance.optimalConcurrency}개`);
    console.log(`   최대 배치 처리량: ${summary.performance.maxBatchThroughput} MB/s`);
  }
  
  // 권장사항
  if (summary.recommendations.length > 0) {
    console.log(chalk.cyan('\n💡 권장사항:'));
    summary.recommendations.forEach(rec => {
      console.log(`   ${rec}`);
    });
  }
  
  console.log(chalk.blue('\n🎯 벤치마크 완료'));
}

/**
 * 벤치마크 결과를 JSON 파일로 저장
 */
async function saveBenchmarkResults(results, summary) {
  const outputFile = path.join(projectRoot, BENCHMARK_CONFIG.outputDir, 'benchmark_results.json');
  
  const benchmarkData = {
    summary,
    results,
    timestamp: new Date().toISOString()
  };
  
  await fs.writeJson(outputFile, benchmarkData, { spaces: 2 });
  console.log(chalk.green(`📁 벤치마크 결과 저장: ${outputFile}`));
}

/**
 * 메인 벤치마크 실행 함수
 */
async function runBenchmarks() {
  console.log(chalk.blue('🚀 ConvertWemp 성능 벤치마크 시작'));
  console.log(chalk.blue('═'.repeat(60)));
  
  // 시스템 정보 수집
  benchmarkResults.systemInfo = collectSystemInfo();
  
  // 출력 디렉토리 정리
  const outputDir = path.join(projectRoot, BENCHMARK_CONFIG.outputDir);
  await fs.remove(outputDir);
  await fs.ensureDir(outputDir);
  
  const allResults = {};
  
  try {
    // 각 벤치마크 실행
    allResults.singleFile = await benchmarkSingleFileConversion();
    allResults.batch = await benchmarkBatchProcessing();
    allResults.quality = await benchmarkQualityLevels();
    allResults.optimization = await benchmarkOptimizationAlgorithms();
    
    // 결과 요약 생성
    const summary = generateBenchmarkSummary(allResults);
    
    // 결과 출력
    printBenchmarkResults(allResults, summary);
    
    // 결과 저장
    await saveBenchmarkResults(allResults, summary);
    
  } catch (error) {
    console.error(chalk.red('💥 벤치마크 실행 중 오류 발생:'), error);
    process.exit(1);
  }
}

// 메인 실행
if (import.meta.url === `file://${process.argv[1]}`) {
  runBenchmarks().catch(error => {
    console.error(chalk.red('💥 벤치마크 실행 중 치명적 오류 발생:'), error);
    process.exit(1);
  });
}

export {
  runBenchmarks,
  benchmarkSingleFileConversion,
  benchmarkBatchProcessing,
  benchmarkQualityLevels,
  benchmarkOptimizationAlgorithms,
  BENCHMARK_CONFIG
}; 