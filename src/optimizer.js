/**
 * GIF to WebP 압축 최적화 알고리즘
 * 품질 vs 크기 자동 최적화를 통해 최적의 변환 설정을 찾음
 * 
 * @author ConvertWemp Team
 * @version 1.0.0
 */

import sharp from 'sharp';
import fs from 'fs-extra';
import path from 'path';

/**
 * 최적화 설정 인터페이스
 * @typedef {Object} OptimizationOptions
 * @property {number} targetCompressionRatio - 목표 압축률 (0.6-0.64)
 * @property {number} minPSNR - 최소 PSNR 값 (35+)
 * @property {number} maxQuality - 최대 품질 설정 (100)
 * @property {number} minQuality - 최소 품질 설정 (30)
 * @property {number} maxEffort - 최대 압축 노력도 (6)
 * @property {boolean} allowLossless - 무손실 압축 허용 여부
 */

/**
 * 최적화 결과 인터페이스
 * @typedef {Object} OptimizationResult
 * @property {number} quality - 최적 품질 설정
 * @property {number} effort - 최적 압축 노력도
 * @property {boolean} lossless - 무손실 압축 여부
 * @property {number} predictedSize - 예상 파일 크기 (bytes)
 * @property {number} compressionRatio - 예상 압축률
 * @property {number} estimatedPSNR - 예상 PSNR 값
 * @property {Object} metadata - 추가 메타데이터
 */

/**
 * 기본 최적화 옵션
 */
const DEFAULT_OPTIONS = {
  targetCompressionRatio: 0.62, // 62% 크기 감소 목표
  minPSNR: 35,
  maxQuality: 95,
  minQuality: 45,
  maxEffort: 6,
  allowLossless: false
};

/**
 * WebP 변환 설정 프리셋
 */
const WEBP_PRESETS = {
  high_quality: { quality: 90, effort: 6, lossless: false },
  balanced: { quality: 75, effort: 6, lossless: false },
  high_compression: { quality: 60, effort: 6, lossless: false },
  ultra_compression: { quality: 45, effort: 6, lossless: false },
  lossless: { quality: 100, effort: 6, lossless: true }
};

/**
 * GIF 파일 분석 결과
 * @typedef {Object} GIFAnalysis
 * @property {number} fileSize - 원본 파일 크기
 * @property {number} width - 이미지 너비
 * @property {number} height - 이미지 높이
 * @property {number} frames - 프레임 수 (추정)
 * @property {string} format - 파일 포맷
 * @property {number} density - 픽셀 밀도
 * @property {boolean} hasAlpha - 투명도 채널 존재 여부
 */

/**
 * GIF 파일 분석
 * @param {string} inputPath - 입력 GIF 파일 경로
 * @returns {Promise<GIFAnalysis>} 분석 결과
 */
async function analyzeGIF(inputPath) {
  try {
    const stats = await fs.stat(inputPath);
    const metadata = await sharp(inputPath).metadata();
    
    // 프레임 수는 Sharp에서 직접 지원하지 않으므로 추정
    const estimatedFrames = Math.max(1, Math.floor(stats.size / (metadata.width * metadata.height * 3)));
    
    return {
      fileSize: stats.size,
      width: metadata.width,
      height: metadata.height,
      frames: Math.min(estimatedFrames, 100), // 최대 100프레임으로 제한
      format: metadata.format,
      density: metadata.density || 72,
      hasAlpha: metadata.channels === 4 || metadata.hasAlpha
    };
    
  } catch (error) {
    throw new Error(`GIF 분석 실패: ${error.message}`);
  }
}

/**
 * 크기 기반 품질 예측
 * @param {number} width - 이미지 너비
 * @param {number} height - 이미지 높이
 * @param {number} frames - 프레임 수
 * @returns {number} 권장 품질 설정
 */
function predictQualityFromSize(width, height, frames) {
  const totalPixels = width * height * frames;
  
  // 픽셀 수에 따른 품질 조정
  if (totalPixels < 50000) { // 매우 작은 이미지
    return 85;
  } else if (totalPixels < 200000) { // 작은 이미지
    return 80;
  } else if (totalPixels < 800000) { // 중간 이미지
    return 75;
  } else if (totalPixels < 2000000) { // 큰 이미지
    return 70;
  } else { // 매우 큰 이미지
    return 65;
  }
}

/**
 * 압축률 기반 최적화
 * @param {GIFAnalysis} analysis - GIF 분석 결과
 * @param {OptimizationOptions} options - 최적화 옵션
 * @returns {Promise<OptimizationResult>} 최적화 결과
 */
async function optimizeForCompression(analysis, options = {}) {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  
  try {
    // 기본 품질 예측
    const baseQuality = predictQualityFromSize(analysis.width, analysis.height, analysis.frames);
    
    // 목표 압축률에 따른 품질 조정
    const targetSizeReduction = opts.targetCompressionRatio;
    const qualityAdjustment = Math.floor((1 - targetSizeReduction) * 30);
    
    let recommendedQuality = Math.max(
      opts.minQuality,
      Math.min(opts.maxQuality, baseQuality - qualityAdjustment)
    );
    
    // 고해상도 이미지의 경우 더 적극적인 압축
    if (analysis.width * analysis.height > 1000000) {
      recommendedQuality = Math.max(opts.minQuality, recommendedQuality - 10);
    }
    
    // 프레임 수가 많은 경우 품질 약간 낮춤
    if (analysis.frames > 20) {
      recommendedQuality = Math.max(opts.minQuality, recommendedQuality - 5);
    }
    
    // 예상 압축률 계산 (경험적 공식)
    const estimatedCompressionRatio = Math.min(
      0.8,
      0.3 + (100 - recommendedQuality) / 100 * 0.4
    );
    
    const predictedSize = Math.floor(analysis.fileSize * (1 - estimatedCompressionRatio));
    
    // PSNR 추정 (품질 기반)
    const estimatedPSNR = Math.max(30, 25 + (recommendedQuality / 100) * 20);
    
    return {
      quality: recommendedQuality,
      effort: opts.maxEffort,
      lossless: false,
      predictedSize,
      compressionRatio: estimatedCompressionRatio,
      estimatedPSNR,
      metadata: {
        optimizationStrategy: 'compression-focused',
        inputAnalysis: analysis,
        qualityAdjustments: {
          baseQuality,
          targetAdjustment: qualityAdjustment,
          sizeAdjustment: analysis.width * analysis.height > 1000000 ? -10 : 0,
          frameAdjustment: analysis.frames > 20 ? -5 : 0
        }
      }
    };
    
  } catch (error) {
    throw new Error(`압축 최적화 실패: ${error.message}`);
  }
}

/**
 * 품질 우선 최적화
 * @param {GIFAnalysis} analysis - GIF 분석 결과
 * @param {OptimizationOptions} options - 최적화 옵션
 * @returns {Promise<OptimizationResult>} 최적화 결과
 */
async function optimizeForQuality(analysis, options = {}) {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  
  try {
    // 품질 우선이므로 높은 품질에서 시작
    let recommendedQuality = 85;
    
    // 파일 크기에 따른 조정
    if (analysis.fileSize > 5 * 1024 * 1024) { // 5MB 이상
      recommendedQuality = 80;
    } else if (analysis.fileSize > 1 * 1024 * 1024) { // 1MB 이상
      recommendedQuality = 85;
    } else {
      recommendedQuality = 90; // 작은 파일은 고품질 유지
    }
    
    // 무손실 압축 고려
    if (opts.allowLossless && analysis.fileSize < 2 * 1024 * 1024) {
      return {
        quality: 100,
        effort: opts.maxEffort,
        lossless: true,
        predictedSize: Math.floor(analysis.fileSize * 0.7), // 무손실도 어느 정도 압축
        compressionRatio: 0.3,
        estimatedPSNR: Infinity, // 무손실이므로 무한대
        metadata: {
          optimizationStrategy: 'quality-focused-lossless',
          inputAnalysis: analysis
        }
      };
    }
    
    const estimatedCompressionRatio = Math.min(0.6, 0.2 + (100 - recommendedQuality) / 100 * 0.3);
    const predictedSize = Math.floor(analysis.fileSize * (1 - estimatedCompressionRatio));
    const estimatedPSNR = Math.max(opts.minPSNR, 30 + (recommendedQuality / 100) * 25);
    
    return {
      quality: recommendedQuality,
      effort: opts.maxEffort,
      lossless: false,
      predictedSize,
      compressionRatio: estimatedCompressionRatio,
      estimatedPSNR,
      metadata: {
        optimizationStrategy: 'quality-focused',
        inputAnalysis: analysis
      }
    };
    
  } catch (error) {
    throw new Error(`품질 최적화 실패: ${error.message}`);
  }
}

/**
 * 균형 최적화 (품질과 압축의 균형)
 * @param {GIFAnalysis} analysis - GIF 분석 결과
 * @param {OptimizationOptions} options - 최적화 옵션
 * @returns {Promise<OptimizationResult>} 최적화 결과
 */
async function optimizeBalanced(analysis, options = {}) {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  
  try {
    // 압축과 품질 최적화의 중간값 계산
    const compressionResult = await optimizeForCompression(analysis, opts);
    const qualityResult = await optimizeForQuality(analysis, opts);
    
    const balancedQuality = Math.floor((compressionResult.quality + qualityResult.quality) / 2);
    const balancedCompressionRatio = (compressionResult.compressionRatio + qualityResult.compressionRatio) / 2;
    
    return {
      quality: balancedQuality,
      effort: opts.maxEffort,
      lossless: false,
      predictedSize: Math.floor(analysis.fileSize * (1 - balancedCompressionRatio)),
      compressionRatio: balancedCompressionRatio,
      estimatedPSNR: Math.max(opts.minPSNR, 30 + (balancedQuality / 100) * 25),
      metadata: {
        optimizationStrategy: 'balanced',
        inputAnalysis: analysis,
        compressionResult,
        qualityResult
      }
    };
    
  } catch (error) {
    throw new Error(`균형 최적화 실패: ${error.message}`);
  }
}

/**
 * 적응형 최적화 (파일 특성에 따라 자동 선택)
 * @param {string} inputPath - 입력 GIF 파일 경로
 * @param {OptimizationOptions} options - 최적화 옵션
 * @returns {Promise<OptimizationResult>} 최적화 결과
 */
async function optimizeAdaptive(inputPath, options = {}) {
  try {
    const analysis = await analyzeGIF(inputPath);
    const opts = { ...DEFAULT_OPTIONS, ...options };
    
    // 파일 특성에 따른 최적화 전략 선택
    let strategy = 'balanced';
    
    if (analysis.fileSize > 10 * 1024 * 1024) { // 10MB 이상 - 압축 우선
      strategy = 'compression';
    } else if (analysis.fileSize < 500 * 1024) { // 500KB 미만 - 품질 우선
      strategy = 'quality';
    } else if (analysis.width * analysis.height > 2000000) { // 고해상도 - 압축 우선
      strategy = 'compression';
    } else if (analysis.frames > 50) { // 프레임 많음 - 압축 우선
      strategy = 'compression';
    }
    
    let result;
    switch (strategy) {
      case 'compression':
        result = await optimizeForCompression(analysis, opts);
        break;
      case 'quality':
        result = await optimizeForQuality(analysis, opts);
        break;
      default:
        result = await optimizeBalanced(analysis, opts);
    }
    
    // 결과에 전략 정보 추가
    result.metadata.selectedStrategy = strategy;
    result.metadata.selectionReason = getStrategyReason(analysis, strategy);
    
    return result;
    
  } catch (error) {
    throw new Error(`적응형 최적화 실패: ${error.message}`);
  }
}

/**
 * 전략 선택 이유 반환
 * @param {GIFAnalysis} analysis - 분석 결과
 * @param {string} strategy - 선택된 전략
 * @returns {string} 선택 이유
 */
function getStrategyReason(analysis, strategy) {
  const reasons = [];
  
  if (analysis.fileSize > 10 * 1024 * 1024) {
    reasons.push('대용량 파일 (>10MB)');
  }
  if (analysis.fileSize < 500 * 1024) {
    reasons.push('소용량 파일 (<500KB)');
  }
  if (analysis.width * analysis.height > 2000000) {
    reasons.push('고해상도 이미지');
  }
  if (analysis.frames > 50) {
    reasons.push('다량 프레임 (>50)');
  }
  
  return reasons.length > 0 ? reasons.join(', ') : '기본 균형 전략';
}

/**
 * 설정 검증
 * @param {OptimizationResult} result - 최적화 결과
 * @param {OptimizationOptions} options - 최적화 옵션
 * @returns {boolean} 검증 통과 여부
 */
function validateOptimization(result, options = {}) {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  
  // PSNR 최소 요구사항 확인
  if (result.estimatedPSNR < opts.minPSNR) {
    console.warn(`⚠️  PSNR이 최소 요구사항(${opts.minPSNR})보다 낮습니다: ${result.estimatedPSNR.toFixed(2)}`);
    return false;
  }
  
  // 압축률 목표 확인
  if (result.compressionRatio < opts.targetCompressionRatio * 0.8) {
    console.warn(`⚠️  압축률이 목표치의 80%에 미달합니다: ${(result.compressionRatio * 100).toFixed(1)}%`);
  }
  
  return true;
}

export {
  analyzeGIF,
  optimizeForCompression,
  optimizeForQuality,
  optimizeBalanced,
  optimizeAdaptive,
  validateOptimization,
  predictQualityFromSize,
  WEBP_PRESETS,
  DEFAULT_OPTIONS
}; 