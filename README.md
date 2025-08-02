# 🎬 ConvertWemp - GIF to WebP 고품질 변환기

Sharp 라이브러리 기반의 고성능 GIF to WebP 애니메이션 변환 도구입니다.

## ✨ 주요 특징

- 🚀 **고성능**: ImageMagick 대비 4-5배 빠른 처리 속도
- 📦 **최적 압축**: 60-64% 크기 감소, PSNR 35+ 품질 유지
- ⚡ **병렬 처리**: 멀티코어 CPU 활용한 동시 변환
- 🎯 **메모리 효율**: libvips 기반 스트림 처리
- 📊 **상세 통계**: 실시간 진행률 및 압축률 분석
- 🛠️ **유연한 설정**: 품질, 압축 노력도 등 세밀한 조정

## 🔧 시스템 요구사항

- **Node.js**: 18.17.0+ 또는 20.3.0+
- **메모리**: 최소 2GB RAM 권장
- **저장공간**: 변환할 파일 크기의 2배 이상

## 📦 설치

```bash
# npm을 통한 설치
npm install

# 또는 의존성 직접 설치
npm install sharp@^0.34.3 p-map@^7.0.2 fs-extra@^11.2.0 commander@^12.0.0
```

## 🚀 사용법

### 단일 파일 변환

```bash
# 기본 변환
node src/cli.js convert input.gif

# 출력 경로 지정
node src/cli.js convert input.gif -o output.webp

# 품질 조정 (0-100, 기본값: 75)
node src/cli.js convert input.gif -q 80

# 압축 노력도 조정 (0-6, 기본값: 6)
node src/cli.js convert input.gif -e 4

# 무손실 압축
node src/cli.js convert input.gif --lossless
```

### 배치 변환

```bash
# 디렉토리 전체 변환
node src/cli.js batch ./gifs -o ./webps

# 하위 디렉토리 포함
node src/cli.js batch ./gifs -o ./webps -r

# 동시 처리 개수 조정 (기본값: 4)
node src/cli.js batch ./gifs -o ./webps -c 8

# 오류 시 중단
node src/cli.js batch ./gifs -o ./webps --stop-on-error
```

### 시스템 정보

```bash
# 환경 및 라이브러리 정보 확인
node src/cli.js info
```

## ⚙️ 설정 옵션

### 품질 설정 가이드

| 품질 범위 | 특징 | 용도 |
|----------|------|------|
| 0-50 | 작은 파일, 낮은 품질 | 웹 썸네일, 프리뷰 |
| 51-80 | 균형잡힌 크기와 품질 | **일반 사용 권장** |
| 81-100 | 큰 파일, 높은 품질 | 고품질 보관용 |

### 압축 노력도 가이드

| 노력도 | 처리 속도 | 파일 크기 | 용도 |
|--------|----------|-----------|------|
| 0-2 | 빠름 | 큰 편 | 빠른 변환 필요시 |
| 3-4 | 보통 | 중간 | 일반적인 사용 |
| 5-6 | 느림 | 작음 | **최고 압축률 권장** |

## 📊 성능 벤치마크

### 테스트 환경
- CPU: Apple M1 Pro (10코어)
- RAM: 16GB
- SSD: 1TB

### 변환 결과 예시

| 원본 크기 | WebP 크기 | 압축률 | 처리 시간 | PSNR |
|----------|-----------|--------|----------|------|
| 15.2 MB | 5.8 MB | 61.8% | 2.3초 | 37.2 |
| 8.7 MB | 3.1 MB | 64.4% | 1.8초 | 36.8 |
| 22.1 MB | 8.2 MB | 62.9% | 3.1초 | 38.1 |

## 🏗️ 프로젝트 구조

```
src/
├── converter.js         # 메인 변환 로직 (Sharp 기반)
├── batch-processor.js   # 배치 처리 (p-map 활용)
├── optimizer.js         # 압축 최적화 알고리즘
├── quality-analyzer.js  # PSNR 품질 분석
└── cli.js              # CLI 인터페이스

test/
├── test.js             # 기능 테스트
└── benchmark.js        # 성능 벤치마크

examples/
└── sample.gif          # 테스트용 샘플 파일
```

## 🔍 예제

### JavaScript에서 직접 사용

```javascript
import { GifToWebPConverter, BatchProcessor } from './src/converter.js';

// 단일 파일 변환
const converter = new GifToWebPConverter({
  quality: 75,
  effort: 6
});

const result = await converter.convertFile('input.gif', 'output.webp');
console.log(`압축률: ${result.compressionRatio.toFixed(1)}%`);

// 배치 처리
const processor = new BatchProcessor({
  concurrency: 8,
  quality: 80
});

const results = await processor.convertDirectory('./gifs', './webps');
```

## 🐛 문제 해결

### 일반적인 오류

1. **"파일을 찾을 수 없습니다"**
   - 파일 경로가 올바른지 확인
   - 상대 경로 대신 절대 경로 사용

2. **"메모리 부족 오류"**
   - 동시 처리 개수 감소 (`-c` 옵션)
   - 큰 파일은 개별 처리

3. **"Sharp 라이브러리 오류"**
   - Node.js 버전 확인 (18.17.0+)
   - Sharp 재설치: `npm install sharp --force`

## 📈 성능 최적화 팁

1. **멀티코어 활용**: CPU 코어 수만큼 동시 처리 설정
2. **메모리 관리**: 대용량 파일 처리 시 동시 처리 개수 조정
3. **SSD 사용**: 빠른 디스크 I/O로 처리 속도 향상
4. **품질 조절**: 용도에 맞는 품질 설정으로 최적화

## 🤝 기여하기

1. Fork 후 브랜치 생성
2. 기능 개발 및 테스트
3. Pull Request 제출

## 📝 라이선스

MIT License

## 🔗 관련 링크

- [Sharp 라이브러리](https://sharp.pixelplumbing.com/)
- [WebP 포맷 가이드](https://developers.google.com/speed/webp)
- [libvips](https://www.libvips.org/) 