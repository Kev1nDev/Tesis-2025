// src/context/CameraContext.tsx
import React, { createContext, useContext, useState, useCallback, useRef } from 'react';

interface CameraContextData {
  activeScreen: string | null;
  setActiveScreen: (screen: string | null) => void;
  isCameraReady: Record<string, boolean>;
  setCameraReady: (screen: string, ready: boolean) => void;
  shouldPauseCamera: boolean;
}

const CameraContext = createContext<CameraContextData>({} as CameraContextData);

export const useCamera = () => useContext(CameraContext);

export const CameraProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [activeScreen, setActiveScreen] = useState<string | null>(null);
  const [isCameraReady, setIsCameraReady] = useState<Record<string, boolean>>({});
  const shouldPauseCamera = useRef(false);

  const setCameraReady = useCallback((screen: string, ready: boolean) => {
    setIsCameraReady(prev => ({ ...prev, [screen]: ready }));
  }, []);

  return (
    <CameraContext.Provider 
      value={{ 
        activeScreen, 
        setActiveScreen, 
        isCameraReady, 
        setCameraReady,
        shouldPauseCamera: shouldPauseCamera.current 
      }}
    >
      {children}
    </CameraContext.Provider>
  );
};