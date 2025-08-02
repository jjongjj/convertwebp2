#!/usr/bin/env node

import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import path from 'path';
import fs from 'fs-extra';
import { GifToWebPConverter } from './converter.js';
import { BatchProcessor } from './batch-processor.js';

const program = new Command();

/**
 * CLI 프로그램 설정
 */
program
  .name('convertwemp')
  .description('🎬 고품질 GIF to WebP 변환기 - Sharp 라이브러리 기반')
  .version('1.0.0');

/**
 * 단일 파일 변환 명령어
 */
program
  .command('convert')
  .description('단일 GIF 파일을 WebP로 변환')
  .argument('<input>', 'GIF 파일 경로')
  .option('-o, --output <path>', '출력 파일 경로')
  .option('-q, --quality <number>', '품질 설정 (0-100)', '75')
  .option('-e, --effort <number>', '압축 노력도 (0-6)', '6')
  .option('--lossless', '무손실 압축 사용')
  .option('--info', 'Sharp 라이브러리 정보 출력')
  .action(async (input, options) => {
    try {
      // Sharp 정보 출력
      if (options.info) {
        await GifToWebPConverter.getSharpInfo();
        return;
      }

      console.log(chalk.blue.bold('🎬 ConvertWemp - GIF to WebP 변환기\n'));

      const converter = new GifToWebPConverter({
        quality: parseInt(options.quality),
        effort: parseInt(options.effort),
        lossless: options.lossless || false
      });

      const inputPath = path.resolve(input);
      const outputPath = options.output 
        ? path.resolve(options.output)
        : converter.generateOutputPath(inputPath);

      console.log(chalk.cyan(`📥 입력: ${inputPath}`));
      console.log(chalk.cyan(`📤 출력: ${outputPath}\n`));

      const spinner = ora('변환 중...').start();
      
      const result = await converter.convertFile(inputPath, outputPath);
      
      spinner.stop();

      if (result.success) {
        console.log(chalk.green.bold('\n✅ 변환 성공!'));
        console.log(`📁 파일: ${path.basename(outputPath)}`);
        console.log(`📏 크기: ${converter.formatBytes(result.inputSize)} → ${converter.formatBytes(result.outputSize)}`);
        console.log(`📊 압축률: ${result.compressionRatio.toFixed(1)}%`);
        console.log(`⏱️  처리시간: ${result.processingTime}ms`);
      } else {
        console.log(chalk.red.bold('\n❌ 변환 실패'));
        console.log(chalk.red(`오류: ${result.error}`));
        process.exit(1);
      }

    } catch (error) {
      console.error(chalk.red.bold('\n❌ 오류 발생'));
      console.error(chalk.red(error.message));
      process.exit(1);
    }
  });

/**
 * 배치 변환 명령어
 */
program
  .command('batch')
  .description('여러 GIF 파일을 배치로 WebP로 변환')
  .argument('<input>', '입력 디렉토리 또는 GIF 파일들')
  .option('-o, --output <dir>', '출력 디렉토리', './output')
  .option('-r, --recursive', '하위 디렉토리 포함')
  .option('-c, --concurrency <number>', '동시 처리 개수', '4')
  .option('-q, --quality <number>', '품질 설정 (0-100)', '75')
  .option('-e, --effort <number>', '압축 노력도 (0-6)', '6')
  .option('--lossless', '무손실 압축 사용')
  .option('--stop-on-error', '오류 시 중단')
  .action(async (input, options) => {
    try {
      console.log(chalk.blue.bold('🎬 ConvertWemp - 배치 변환기\n'));

      const processor = new BatchProcessor({
        concurrency: parseInt(options.concurrency),
        quality: parseInt(options.quality),
        effort: parseInt(options.effort),
        lossless: options.lossless || false,
        stopOnError: options.stopOnError || false
      });

      const inputPath = path.resolve(input);
      const outputDir = path.resolve(options.output);

      console.log(chalk.cyan(`📥 입력: ${inputPath}`));
      console.log(chalk.cyan(`📤 출력: ${outputDir}`));
      console.log(chalk.cyan(`⚡ 동시 처리: ${options.concurrency}개\n`));

      let progressSpinner;
      
      // 진행률 콜백 설정
      processor.setProgressCallback((progress) => {
        if (progressSpinner) {
          progressSpinner.text = `변환 중... ${progress.completed}/${progress.total} (${((progress.completed / progress.total) * 100).toFixed(1)}%)`;
        }
      });

      // 입력이 디렉토리인지 파일인지 확인
      const stat = await fs.stat(inputPath);
      let results;

      if (stat.isDirectory()) {
        progressSpinner = ora('GIF 파일 스캔 중...').start();
        results = await processor.convertDirectory(inputPath, outputDir, options.recursive);
      } else if (stat.isFile()) {
        progressSpinner = ora('변환 중...').start();
        results = await processor.convertFiles([inputPath], outputDir);
      } else {
        throw new Error('올바르지 않은 입력 경로입니다.');
      }

      progressSpinner.stop();

      const successful = results.filter(r => r.success);
      const failed = results.filter(r => !r.success);

      if (successful.length > 0) {
        console.log(chalk.green.bold(`\n🎉 배치 변환 완료! (${successful.length}/${results.length})`));
      }

      if (failed.length > 0) {
        console.log(chalk.yellow.bold(`\n⚠️  실패한 파일: ${failed.length}개`));
      }

    } catch (error) {
      console.error(chalk.red.bold('\n❌ 오류 발생'));
      console.error(chalk.red(error.message));
      process.exit(1);
    }
  });

/**
 * 시스템 정보 명령어
 */
program
  .command('info')
  .description('시스템 및 라이브러리 정보 출력')
  .action(async () => {
    try {
      console.log(chalk.blue.bold('🎬 ConvertWemp - 시스템 정보\n'));
      
      // Node.js 정보
      console.log(chalk.cyan.bold('🟢 Node.js 환경:'));
      console.log(`   버전: ${process.version}`);
      console.log(`   플랫폼: ${process.platform} ${process.arch}`);
      console.log(`   메모리: ${(process.memoryUsage().rss / 1024 / 1024).toFixed(1)}MB\n`);
      
      // Sharp 정보
      await GifToWebPConverter.getSharpInfo();
      
      // CPU 정보
      const os = await import('os');
      console.log(chalk.cyan.bold('\n💻 CPU 정보:'));
      console.log(`   CPU 코어: ${os.cpus().length}개`);
      console.log(`   아키텍처: ${os.arch()}`);
      console.log(`   여유 메모리: ${(os.freemem() / 1024 / 1024 / 1024).toFixed(1)}GB`);
      
    } catch (error) {
      console.error(chalk.red('정보를 가져올 수 없습니다:', error.message));
    }
  });

/**
 * 도움말 개선
 */
program.on('--help', () => {
  console.log('\n사용 예시:');
  console.log('  $ convertwemp convert input.gif -o output.webp');
  console.log('  $ convertwemp batch ./gifs -o ./webps -c 8');
  console.log('  $ convertwemp batch ./gifs -r --lossless');
  console.log('  $ convertwemp info');
  console.log('\n품질 설정 가이드:');
  console.log('  품질 0-50:   작은 파일 크기, 낮은 품질');
  console.log('  품질 51-80:  균형잡힌 크기와 품질 (권장)');
  console.log('  품질 81-100: 큰 파일 크기, 높은 품질');
  console.log('\n압축 노력도 가이드:');
  console.log('  0-2: 빠른 처리, 큰 파일 크기');
  console.log('  3-4: 균형잡힌 처리 속도와 크기');
  console.log('  5-6: 느린 처리, 작은 파일 크기 (권장)');
});

// 인수가 없으면 도움말 출력
if (process.argv.length <= 2) {
  program.help();
}

// 오류 처리
process.on('unhandledRejection', (reason, promise) => {
  console.error(chalk.red.bold('❌ 처리되지 않은 오류:'));
  console.error(chalk.red(reason));
  process.exit(1);
});

process.on('uncaughtException', (error) => {
  console.error(chalk.red.bold('❌ 예상치 못한 오류:'));
  console.error(chalk.red(error.message));
  process.exit(1);
});

// 프로그램 실행
program.parse();

export default program; 