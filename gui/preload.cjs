/**
 * ConvertWemp GUI - Preload 스크립트
 * 안전한 IPC 통신을 위한 API 브릿지
 */

const { contextBridge, ipcRenderer } = require('electron');
const path = require('path');

// 렌더러 프로세스에서 사용할 안전한 API 노출
contextBridge.exposeInMainWorld('electronAPI', {
  // 파일 시스템 API
  path: {
    basename: (filePath) => path.basename(filePath),
    dirname: (filePath) => path.dirname(filePath)
  },
  
  // IPC 통신 API
  ipc: {
    // 파일 선택
    selectFiles: () => ipcRenderer.invoke('select-files'),
    
    // 출력 폴더 선택
    selectOutputFolder: () => ipcRenderer.invoke('select-output-folder'),
    
    // 폴더 열기
    openFolder: (folderPath) => ipcRenderer.invoke('open-folder', folderPath),
    
    // 파일 변환
    convertFiles: (files, options) => ipcRenderer.invoke('convert-files', files, options),
    
    // 앱 정보
    getAppInfo: () => ipcRenderer.invoke('get-app-info'),
    
    // 이벤트 리스너
    onConversionProgress: (callback) => {
      ipcRenderer.on('conversion-progress', callback);
      // 리스너 제거 함수 반환
      return () => ipcRenderer.removeListener('conversion-progress', callback);
    }
  }
});

console.log('ConvertWemp Preload 스크립트 로드됨'); 