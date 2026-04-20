#!/bin/bash
# CAP — Arranca el servidor web con doble clic
# Si no tienes Node.js, el script te lleva a descargarlo.

# Ir al directorio del script (funcione desde donde funcione)
cd "$(dirname "$0")"

echo ""
echo "╔════════════════════════════════════════════╗"
echo "║   CAP — Consultoría Adaptativa Pymes       ║"
echo "║   Arranque del servidor web                ║"
echo "╚════════════════════════════════════════════╝"
echo ""

# 1. Verificar que Node.js está instalado
if ! command -v node >/dev/null 2>&1; then
  echo "❌ No tienes Node.js instalado."
  echo ""
  echo "   Descárgalo (versión LTS) desde:"
  echo "   https://nodejs.org"
  echo ""
  echo "   Instálalo y luego vuelve a hacer doble clic en este archivo."
  echo ""
  open "https://nodejs.org"
  echo "Pulsa Intro para cerrar esta ventana..."
  read
  exit 1
fi

echo "✅ Node.js detectado: $(node -v)"
echo "✅ npm detectado:     $(npm -v)"
echo ""

# 2. Instalar dependencias si hace falta
if [ ! -d "node_modules" ]; then
  echo "📦 Instalando dependencias por primera vez..."
  echo ""
  npm install
  if [ $? -ne 0 ]; then
    echo ""
    echo "❌ Error instalando dependencias. Revisa la conexión y vuelve a intentarlo."
    echo "Pulsa Intro para cerrar..."
    read
    exit 1
  fi
  echo ""
fi

# 3. Abrir el navegador tras un pequeño retardo (para dar tiempo al server)
(
  sleep 2
  open "http://localhost:3000"
) &

# 4. Arrancar el servidor
echo "🚀 Arrancando servidor en http://localhost:3000"
echo "   Admin:  http://localhost:3000/admin?token=cap-admin-2026"
echo ""
echo "   Para parar el servidor: pulsa Ctrl+C en esta ventana."
echo ""

npm start
