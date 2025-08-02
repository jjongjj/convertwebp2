# 테스트 예제 파일들

이 폴더는 GIF to WebP 변환기의 테스트를 위한 다양한 예제 파일들을 포함합니다.

## 포함된 테스트 파일들

### 기본 테스트 파일
- `korea-flag100a-test.gif` - 기존 한국 국기 애니메이션 (52KB)
- `small-test.gif` - 작은 크기 테스트 파일
- `medium-test.gif` - 중간 크기 테스트 파일

### 생성된 테스트 파일들 (generate-test-gifs.js 실행 후)
- `tiny-test.png` - 64x64, 5프레임 시뮬레이션
- `small-square.png` - 200x200, 8프레임 시뮬레이션  
- `medium-wide.png` - 400x200, 12프레임 시뮬레이션
- `large-test.png` - 800x600, 20프레임 시뮬레이션
- `ultra-wide.png` - 1200x300, 15프레임 시뮬레이션

## 테스트 파일 생성

```bash
node examples/generate-test-gifs.js
```

## 변환 테스트 실행

개별 파일 변환:
```bash
npm start -- examples/korea-flag100a-test.gif
```

배치 변환:
```bash
npm start -- examples/*.gif
```

## 파일 특성

| 파일명 | 크기 | 프레임 수 | 용도 |
|--------|------|-----------|------|
| korea-flag100a-test.gif | 52KB | ~20 | 실제 애니메이션 테스트 |
| small-test.gif | ~8KB | ~10 | 소형 파일 최적화 테스트 |
| medium-test.gif | ~360KB | ~30 | 중간 크기 압축 테스트 |

## 테스트 시나리오

1. **품질 테스트**: PSNR 35+ 유지 확인
2. **압축 테스트**: 60-64% 크기 감소 확인  
3. **성능 테스트**: ImageMagick 대비 4-5배 속도 확인
4. **배치 처리 테스트**: 여러 파일 동시 변환
5. **에러 핸들링 테스트**: 손상된 파일 처리 