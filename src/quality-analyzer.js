/**
 * PSNR 품질 분석 모듈
 * GIF to WebP 변환 시 이미지 품질을 정확히 측정하고 분석
 * 
 * @author ConvertWemp Team
 * @version 1.0.0
 */

import sharp from 'sharp';
import fs from 'fs-extra';
import path from 'path';

/**
 * 품질 분석 결과 인터페이스
 * @typedef {Object} QualityAnalysisResult
 * @property {number} psnr - PSNR 값 (Peak Signal-to-Noise Ratio)
 * @property {number} mse - MSE 값 (Mean Squared Error)
 * @property {number} ssim - SSIM 값 (Structural Similarity Index, 추정)
 * @property {number} compressionRatio - 실제 압축률
 * @property {number} qualityScore - 종합 품질 점수 (0-100)
 * @property {Object} metadata - 추가 분석 정보
 */

/**
 * 이미지 비교 통계
 * @typedef {Object} ImageComparisonStats
 * @property {number} originalSize - 원본 파일 크기
 * @property {number} compressedSize - 압축된 파일 크기
 * @property {number} width - 이미지 너비
 * @property {number} height - 이미지 높이
 * @property {number} channels - 채널 수
 * @property {string} originalFormat - 원본 포맷
 * @property {string} compressedFormat - 압축된 포맷
 */

/**
 * 품질 평가 기준
 */
const QUALITY_THRESHOLDS = {
  excellent: { psnr: 40, ssim: 0.95, score: 90 },
  good: { psnr: 35, ssim: 0.90, score: 75 },
  acceptable: { psnr: 30, ssim: 0.85, score: 60 },
  poor: { psnr: 25, ssim: 0.80, score: 40 },
  unacceptable: { psnr: 20, ssim: 0.70, score: 20 }
};

/**
 * 이미지를 RGB 픽셀 배열로 변환
 * @param {string} imagePath - 이미지 파일 경로
 * @param {number} targetWidth - 목표 너비 (리사이즈용)
 * @param {number} targetHeight - 목표 높이 (리사이즈용)
 * @returns {Promise<{data: Uint8Array, width: number, height: number, channels: number}>}
 */
async function imageToPixelArray(imagePath, targetWidth = null, targetHeight = null) {
  try {
    let sharpInstance = sharp(imagePath);
    
    // 첫 번째 프레임만 추출 (애니메이션 GIF의 경우)
    if (path.extname(imagePath).toLowerCase() === '.gif') {
      sharpInstance = sharpInstance.png(); // GIF를 PNG로 변환하여 첫 프레임 추출
    }
    
    // 필요한 경우 리사이즈
    if (targetWidth && targetHeight) {
      sharpInstance = sharpInstance.resize(targetWidth, targetHeight, {
        fit: 'fill',
        kernel: sharp.kernel.lanczos3
      });
    }
    
    // RGB 형식으로 변환
    const { data, info } = await sharpInstance
      .removeAlpha() // 알파 채널 제거 (ensureAlpha 대신 사용)
      .raw()
      .toBuffer({ resolveWithObject: true });
    
    return {
      data: new Uint8Array(data),
      width: info.width,
      height: info.height,
      channels: info.channels
    };
    
  } catch (error) {
    throw new Error(`이미지 픽셀 배열 변환 실패: ${error.message}`);
  }
}

/**
 * MSE (Mean Squared Error) 계산
 * @param {Uint8Array} originalPixels - 원본 픽셀 데이터
 * @param {Uint8Array} compressedPixels - 압축된 픽셀 데이터
 * @param {number} channels - 채널 수
 * @returns {number} MSE 값
 */
function calculateMSE(originalPixels, compressedPixels, channels = 3) {
  if (originalPixels.length !== compressedPixels.length) {
    throw new Error('픽셀 배열 크기가 일치하지 않습니다');
  }
  
  let totalSquaredDiff = 0;
  const pixelCount = originalPixels.length / channels;
  
  for (let i = 0; i < originalPixels.length; i += channels) {
    for (let c = 0; c < channels; c++) {
      const diff = originalPixels[i + c] - compressedPixels[i + c];
      totalSquaredDiff += diff * diff;
    }
  }
  
  return totalSquaredDiff / (pixelCount * channels);
}

/**
 * PSNR (Peak Signal-to-Noise Ratio) 계산
 * @param {number} mse - MSE 값
 * @param {number} maxPixelValue - 최대 픽셀 값 (일반적으로 255)
 * @returns {number} PSNR 값 (dB)
 */
function calculatePSNR(mse, maxPixelValue = 255) {
  if (mse === 0) {
    return Infinity; // 동일한 이미지
  }
  
  const psnr = 20 * Math.log10(maxPixelValue / Math.sqrt(mse));
  return Math.round(psnr * 100) / 100; // 소수점 둘째 자리까지
}

/**
 * SSIM (Structural Similarity Index) 추정
 * 실제 SSIM은 복잡한 계산이 필요하므로 PSNR 기반으로 추정
 * @param {number} psnr - PSNR 값
 * @returns {number} 추정 SSIM 값 (0-1)
 */
function estimateSSIM(psnr) {
  if (psnr === Infinity) {
    return 1.0;
  }
  
  // PSNR과 SSIM 간의 경험적 관계식
  // PSNR이 높을수록 SSIM도 높아지는 경향
  const normalizedPSNR = Math.max(0, Math.min(50, psnr)) / 50;
  const ssim = 0.5 + (normalizedPSNR * 0.5); // 0.5 ~ 1.0 범위
  
  return Math.round(ssim * 1000) / 1000; // 소수점 셋째 자리까지
}

/**
 * 종합 품질 점수 계산
 * @param {number} psnr - PSNR 값
 * @param {number} ssim - SSIM 값
 * @param {number} compressionRatio - 압축률
 * @returns {number} 품질 점수 (0-100)
 */
function calculateQualityScore(psnr, ssim, compressionRatio) {
  // PSNR 기반 점수 (60% 가중치)
  let psnrScore = 0;
  if (psnr >= QUALITY_THRESHOLDS.excellent.psnr) {
    psnrScore = 100;
  } else if (psnr >= QUALITY_THRESHOLDS.good.psnr) {
    psnrScore = 75 + ((psnr - QUALITY_THRESHOLDS.good.psnr) / 
                     (QUALITY_THRESHOLDS.excellent.psnr - QUALITY_THRESHOLDS.good.psnr)) * 25;
  } else if (psnr >= QUALITY_THRESHOLDS.acceptable.psnr) {
    psnrScore = 50 + ((psnr - QUALITY_THRESHOLDS.acceptable.psnr) / 
                     (QUALITY_THRESHOLDS.good.psnr - QUALITY_THRESHOLDS.acceptable.psnr)) * 25;
  } else {
    psnrScore = Math.max(0, (psnr / QUALITY_THRESHOLDS.acceptable.psnr) * 50);
  }
  
  // SSIM 기반 점수 (30% 가중치)
  const ssimScore = ssim * 100;
  
  // 압축률 보너스 (10% 가중치) - 높은 압축률에 약간의 보너스
  const compressionBonus = Math.min(10, compressionRatio * 15);
  
  const totalScore = (psnrScore * 0.6) + (ssimScore * 0.3) + (compressionBonus * 0.1);
  
  return Math.round(Math.min(100, Math.max(0, totalScore)));
}

/**
 * 품질 등급 결정
 * @param {number} psnr - PSNR 값
 * @param {number} ssim - SSIM 값
 * @param {number} qualityScore - 품질 점수
 * @returns {string} 품질 등급
 */
function getQualityGrade(psnr, ssim, qualityScore) {
  if (psnr >= QUALITY_THRESHOLDS.excellent.psnr && qualityScore >= QUALITY_THRESHOLDS.excellent.score) {
    return 'excellent';
  } else if (psnr >= QUALITY_THRESHOLDS.good.psnr && qualityScore >= QUALITY_THRESHOLDS.good.score) {
    return 'good';
  } else if (psnr >= QUALITY_THRESHOLDS.acceptable.psnr && qualityScore >= QUALITY_THRESHOLDS.acceptable.score) {
    return 'acceptable';
  } else if (psnr >= QUALITY_THRESHOLDS.poor.psnr) {
    return 'poor';
  } else {
    return 'unacceptable';
  }
}

/**
 * 이미지 파일 간 품질 비교
 * @param {string} originalPath - 원본 이미지 경로
 * @param {string} compressedPath - 압축된 이미지 경로
 * @returns {Promise<QualityAnalysisResult>} 품질 분석 결과
 */
async function compareImageQuality(originalPath, compressedPath) {
  try {
    // 파일 크기 정보 수집
    const originalStats = await fs.stat(originalPath);
    const compressedStats = await fs.stat(compressedPath);
    const compressionRatio = (originalStats.size - compressedStats.size) / originalStats.size;
    
    // 원본 이미지의 메타데이터 확인
    const originalMetadata = await sharp(originalPath).metadata();
    
    // 두 이미지를 같은 크기로 정규화하여 픽셀 비교
    const targetWidth = originalMetadata.width;
    const targetHeight = originalMetadata.height;
    
    console.log(`🔍 품질 분석 시작: ${targetWidth}x${targetHeight}`);
    
    // 픽셀 데이터 추출
    const [originalPixels, compressedPixels] = await Promise.all([
      imageToPixelArray(originalPath, targetWidth, targetHeight),
      imageToPixelArray(compressedPath, targetWidth, targetHeight)
    ]);
    
    // 채널 수 확인 및 조정
    const channels = Math.min(originalPixels.channels, compressedPixels.channels, 3); // RGB만 비교
    
    // MSE 계산
    const mse = calculateMSE(originalPixels.data, compressedPixels.data, channels);
    
    // PSNR 계산
    const psnr = calculatePSNR(mse);
    
    // SSIM 추정
    const ssim = estimateSSIM(psnr);
    
    // 종합 품질 점수 계산
    const qualityScore = calculateQualityScore(psnr, ssim, compressionRatio);
    
    // 품질 등급 결정
    const qualityGrade = getQualityGrade(psnr, ssim, qualityScore);
    
    const result = {
      psnr,
      mse,
      ssim,
      compressionRatio,
      qualityScore,
      metadata: {
        qualityGrade,
        originalSize: originalStats.size,
        compressedSize: compressedStats.size,
        width: targetWidth,
        height: targetHeight,
        channels,
        originalFormat: originalMetadata.format,
        compressedFormat: path.extname(compressedPath).substring(1),
        analysis: {
          pixelCount: targetWidth * targetHeight,
          bytesCompared: originalPixels.data.length,
          avgPixelDifference: Math.sqrt(mse),
          sizeSavings: originalStats.size - compressedStats.size
        }
      }
    };
    
    console.log(`✅ 품질 분석 완료: PSNR ${psnr}dB, 품질 점수 ${qualityScore}, 등급 ${qualityGrade}`);
    
    return result;
    
  } catch (error) {
    throw new Error(`품질 비교 분석 실패: ${error.message}`);
  }
}

/**
 * 배치 품질 분석
 * @param {Array<{original: string, compressed: string}>} imagePairs - 이미지 쌍 배열
 * @returns {Promise<Array<QualityAnalysisResult>>} 품질 분석 결과 배열
 */
async function batchQualityAnalysis(imagePairs) {
  const results = [];
  
  console.log(`🔍 배치 품질 분석 시작: ${imagePairs.length}개 파일`);
  
  for (let i = 0; i < imagePairs.length; i++) {
    const { original, compressed } = imagePairs[i];
    
    try {
      console.log(`📊 분석 중 (${i + 1}/${imagePairs.length}): ${path.basename(original)}`);
      
      const result = await compareImageQuality(original, compressed);
      result.metadata.batchIndex = i;
      result.metadata.originalFile = path.basename(original);
      result.metadata.compressedFile = path.basename(compressed);
      
      results.push(result);
      
    } catch (error) {
      console.error(`❌ ${path.basename(original)} 분석 실패:`, error.message);
      
      // 실패한 경우 기본값으로 결과 추가
      results.push({
        psnr: 0,
        mse: Infinity,
        ssim: 0,
        compressionRatio: 0,
        qualityScore: 0,
        metadata: {
          qualityGrade: 'error',
          error: error.message,
          batchIndex: i,
          originalFile: path.basename(original),
          compressedFile: path.basename(compressed)
        }
      });
    }
  }
  
  // 통계 계산
  const validResults = results.filter(r => r.psnr > 0);
  const avgPSNR = validResults.length > 0 ? 
    validResults.reduce((sum, r) => sum + r.psnr, 0) / validResults.length : 0;
  const avgQualityScore = validResults.length > 0 ? 
    validResults.reduce((sum, r) => sum + r.qualityScore, 0) / validResults.length : 0;
  const avgCompressionRatio = validResults.length > 0 ? 
    validResults.reduce((sum, r) => sum + r.compressionRatio, 0) / validResults.length : 0;
  
  console.log(`📈 배치 분석 완료:`);
  console.log(`   평균 PSNR: ${avgPSNR.toFixed(2)}dB`);
  console.log(`   평균 품질 점수: ${avgQualityScore.toFixed(1)}`);
  console.log(`   평균 압축률: ${(avgCompressionRatio * 100).toFixed(1)}%`);
  console.log(`   성공/실패: ${validResults.length}/${results.length - validResults.length}`);
  
  return results;
}

/**
 * 품질 분석 보고서 생성
 * @param {QualityAnalysisResult|Array<QualityAnalysisResult>} analysisResult - 분석 결과
 * @returns {string} 보고서 텍스트
 */
function generateQualityReport(analysisResult) {
  const results = Array.isArray(analysisResult) ? analysisResult : [analysisResult];
  const validResults = results.filter(r => r.psnr > 0);
  
  if (validResults.length === 0) {
    return '❌ 품질 분석 결과가 없습니다.';
  }
  
  let report = '';
  
  if (results.length === 1) {
    // 단일 파일 보고서
    const result = results[0];
    report += '📊 이미지 품질 분석 보고서\n';
    report += '================================\n\n';
    report += `🎯 종합 평가: ${result.metadata.qualityGrade.toUpperCase()}\n`;
    report += `📈 품질 점수: ${result.qualityScore}/100\n`;
    report += `📏 PSNR: ${result.psnr}dB\n`;
    report += `🔗 SSIM: ${result.ssim}\n`;
    report += `📦 압축률: ${(result.compressionRatio * 100).toFixed(1)}%\n`;
    report += `📐 해상도: ${result.metadata.width}x${result.metadata.height}\n`;
    report += `💾 크기 감소: ${(result.metadata.analysis.sizeSavings / 1024).toFixed(1)}KB\n`;
  } else {
    // 배치 분석 보고서
    const avgPSNR = validResults.reduce((sum, r) => sum + r.psnr, 0) / validResults.length;
    const avgScore = validResults.reduce((sum, r) => sum + r.qualityScore, 0) / validResults.length;
    const avgCompression = validResults.reduce((sum, r) => sum + r.compressionRatio, 0) / validResults.length;
    
    const excellentCount = validResults.filter(r => r.metadata.qualityGrade === 'excellent').length;
    const goodCount = validResults.filter(r => r.metadata.qualityGrade === 'good').length;
    const acceptableCount = validResults.filter(r => r.metadata.qualityGrade === 'acceptable').length;
    const poorCount = validResults.filter(r => r.metadata.qualityGrade === 'poor').length;
    
    report += '📊 배치 품질 분석 보고서\n';
    report += '==========================\n\n';
    report += `📁 총 파일 수: ${results.length}\n`;
    report += `✅ 성공: ${validResults.length}\n`;
    report += `❌ 실패: ${results.length - validResults.length}\n\n`;
    report += `📈 평균 품질 점수: ${avgScore.toFixed(1)}/100\n`;
    report += `📏 평균 PSNR: ${avgPSNR.toFixed(2)}dB\n`;
    report += `📦 평균 압축률: ${(avgCompression * 100).toFixed(1)}%\n\n`;
    report += '🏆 품질 등급별 분포:\n';
    report += `   우수 (Excellent): ${excellentCount}개\n`;
    report += `   양호 (Good): ${goodCount}개\n`;
    report += `   허용 (Acceptable): ${acceptableCount}개\n`;
    report += `   부족 (Poor): ${poorCount}개\n`;
  }
  
  return report;
}

/**
 * 품질 기준 검증
 * @param {QualityAnalysisResult} result - 분석 결과
 * @param {Object} criteria - 품질 기준
 * @returns {boolean} 기준 통과 여부
 */
function validateQualityCriteria(result, criteria = {}) {
  const {
    minPSNR = 35,
    minQualityScore = 75,
    maxCompressionRatio = 0.64,
    minCompressionRatio = 0.60
  } = criteria;
  
  const checks = {
    psnr: result.psnr >= minPSNR,
    qualityScore: result.qualityScore >= minQualityScore,
    compressionRatio: result.compressionRatio >= minCompressionRatio && 
                     result.compressionRatio <= maxCompressionRatio
  };
  
  const passed = Object.values(checks).every(check => check);
  
  if (!passed) {
    console.warn('⚠️  품질 기준 미달:');
    if (!checks.psnr) console.warn(`   PSNR: ${result.psnr}dB < ${minPSNR}dB`);
    if (!checks.qualityScore) console.warn(`   품질 점수: ${result.qualityScore} < ${minQualityScore}`);
    if (!checks.compressionRatio) console.warn(`   압축률: ${(result.compressionRatio * 100).toFixed(1)}% (목표: ${minCompressionRatio * 100}-${maxCompressionRatio * 100}%)`);
  }
  
  return passed;
}

export {
  compareImageQuality,
  batchQualityAnalysis,
  generateQualityReport,
  validateQualityCriteria,
  calculateMSE,
  calculatePSNR,
  estimateSSIM,
  calculateQualityScore,
  imageToPixelArray,
  QUALITY_THRESHOLDS
}; 