# ConvertWemp 테스트 스위트

이 디렉토리는 ConvertWemp 프로젝트의 종합적인 테스트 및 벤치마크 도구들을 포함합니다.

## 📋 포함된 테스트 도구

### 1. 종합 테스트 스위트 (`test.js`)
품질 회귀 테스트, 기능 테스트, 통합 테스트를 포함한 완전한 테스트 스위트

**실행 방법:**
```bash
npm test
# 또는
node test/test.js
```

**테스트 항목:**
- ✅ 기본 기능 테스트 (GIF 분석, 최적화 설정)
- ✅ 변환 품질 테스트 (PSNR 35+ 검증)
- ✅ 압축률 테스트 (60-64% 목표 달성)
- ✅ 배치 처리 테스트 (동시 변환)
- ✅ 성능 테스트 (처리 속도)
- ✅ 에러 핸들링 테스트

### 2. 성능 벤치마크 (`benchmark.js`)
ImageMagick 대비 성능 비교 및 다양한 시나리오 벤치마크

**실행 방법:**
```bash
npm run benchmark
# 또는
node test/benchmark.js
```

**벤치마크 항목:**
- 🚀 단일 파일 변환 성능 (ImageMagick 대비)
- 🔄 배치 처리 성능 (동시성 레벨별)
- 🎯 품질별 성능 분석
- 🧠 최적화 알고리즘 성능

## 🎯 품질 기준

### PSNR (Peak Signal-to-Noise Ratio)
- **최소 요구사항**: 35dB 이상
- **우수**: 40dB 이상
- **양호**: 35-40dB
- **허용**: 30-35dB

### 압축률
- **목표**: 60-64% 크기 감소
- **최소**: 60% 이상
- **최대**: 64% 이하

### 성능
- **목표**: ImageMagick 대비 4-5배 속도 향상
- **처리량**: 5MB/초 이상
- **메모리**: 512MB 이하

## 📊 테스트 결과 해석

### 테스트 성공 기준
```
✅ 통과: 모든 품질 및 성능 기준 충족
❌ 실패: 하나 이상의 기준 미달
⏭️  건너뜀: 테스트 파일 부재 또는 환경 제약
```

### 벤치마크 결과 해석
```json
{
  "performance": {
    "avgSpeedupVsImageMagick": "4.5x",  // ImageMagick 대비 속도 향상
    "avgThroughput": "8.2 MB/s",        // 평균 처리량
    "optimalConcurrency": 4              // 최적 동시 처리 수
  }
}
```

## 🔧 테스트 환경 설정

### 필요한 의존성
```bash
# 기본 의존성 설치
npm install

# ImageMagick 설치 (벤치마크 비교용, 선택사항)
# macOS
brew install imagemagick

# Ubuntu/Debian
sudo apt-get install imagemagick

# Windows
# https://imagemagick.org/script/download.php#windows
```

### 테스트 파일 준비
```bash
# 테스트 GIF 파일들이 examples/ 폴더에 있는지 확인
ls examples/*.gif

# 추가 테스트 파일 생성 (선택사항)
node examples/generate-test-gifs.js
```

## 📁 출력 디렉토리

### 테스트 출력
- `test/output/` - 테스트 중 생성된 변환 파일들
- `test/output/batch/` - 배치 처리 테스트 결과

### 벤치마크 출력
- `test/benchmark_output/` - 벤치마크 결과 파일들
- `test/benchmark_output/benchmark_results.json` - 상세 벤치마크 데이터

## 🚨 문제 해결

### 일반적인 문제들

**1. Sharp 설치 문제**
```bash
# Sharp 재설치
npm uninstall sharp
npm install sharp
```

**2. 메모리 부족 오류**
```bash
# Node.js 메모리 제한 증가
node --max-old-space-size=2048 test/test.js
```

**3. ImageMagick 사용 불가**
- 벤치마크는 Sharp만으로도 실행 가능
- ImageMagick 비교는 선택사항

**4. 테스트 파일 부재**
```bash
# examples 폴더에 GIF 파일 추가 또는
# 다운로드한 테스트 파일 사용
curl -o examples/test.gif "URL_TO_GIF_FILE"
```

## 📈 지속적 통합 (CI)

### GitHub Actions 예시
```yaml
name: Tests
on: [push, pull_request]
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v2
      - uses: actions/setup-node@v2
        with:
          node-version: '18'
      - run: npm ci
      - run: npm test
      - run: npm run benchmark
```

### 테스트 자동화
```bash
# 품질 회귀 테스트 (CI/CD)
npm test

# 성능 회귀 테스트 (정기적)
npm run benchmark
```

## 🎯 테스트 확장

### 새로운 테스트 추가
1. `test/test.js`에 새로운 테스트 함수 작성
2. `runAllTests()` 함수에 추가
3. 필요시 `TEST_CONFIG`에 설정 추가

### 새로운 벤치마크 추가
1. `test/benchmark.js`에 새로운 벤치마크 함수 작성
2. `runBenchmarks()` 함수에 추가
3. 결과 요약에 메트릭 추가

## 📚 관련 문서

- [프로젝트 README](../README.md)
- [예제 파일 가이드](../examples/README.md)
- [API 문서](../src/)
- [설정 가이드](../.cursorrules)

---

**💡 팁**: 개발 중에는 `npm test`로 빠른 검증을, 릴리스 전에는 `npm run benchmark`로 성능 검증을 권장합니다. 