#!/bin/bash
# ConvertWemp GUI 시작 스크립트

# 스크립트가 있는 디렉토리로 이동
cd "$(dirname "$0")"

# Node.js와 npm이 설치되어 있는지 확인
if ! command -v npm &> /dev/null; then
    echo "❌ npm이 설치되어 있지 않습니다."
    echo "Node.js를 설치해주세요: https://nodejs.org"
    read -p "엔터를 눌러 종료하세요..."
    exit 1
fi

# 의존성 설치 (처음 실행시에만)
if [ ! -d "node_modules" ]; then
    echo "📦 의존성 설치 중..."
    npm install
fi

echo "🚀 ConvertWemp GUI를 시작합니다..."
echo "💡 종료하려면 터미널에서 Ctrl+C를 누르세요"

# GUI 실행
npm run gui 