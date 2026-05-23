@echo off
chcp 65001 > nul
title Такси Жаңабазар - Expo
echo.
echo ========================================
echo   Такси Жаңабазар - React Native App
echo ========================================
echo.
echo [1] Телефонга "Expo Go" жуктеп алыныз:
echo     Android: Play Store - "Expo Go"
echo     iPhone:  App Store  - "Expo Go"
echo.
echo [2] Осы терезеде QR код шыгады
echo     Expo Go кошымшасын ашып, QR скан жасаныз
echo.
echo ========================================
echo.
cd /d "%~dp0"
npx expo start --clear
pause
