#!/usr/bin/env bash
set -euo pipefail

echo "=================================================="
echo "🚀 Başlatılıyor: Esteworld POC Google Colab Kurulumu"
echo "=================================================="

# 1. Root dizini bulalım
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

echo "[1/8] 📦 Node.js 20, Redis ve Zstd kuruluyor..."
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs redis-server zstd

echo "[2/8] 🗄️ Redis servisi başlatılıyor..."
sudo service redis-server start

echo "[3/8] 🧠 Qdrant (Vektör DB) indiriliyor ve başlatılıyor..."
if [ ! -f "qdrant" ]; then
    wget -q https://github.com/qdrant/qdrant/releases/latest/download/qdrant-x86_64-unknown-linux-gnu.tar.gz
    tar -xzf qdrant-x86_64-unknown-linux-gnu.tar.gz
    rm qdrant-x86_64-unknown-linux-gnu.tar.gz
fi
nohup ./qdrant > qdrant.log 2>&1 &
echo "Qdrant arka planda çalışıyor."

echo "[4/8] 🤖 Ollama (Yapay Zeka Motoru) kuruluyor..."
if ! command -v ollama &> /dev/null; then
    curl -fsSL https://ollama.com/install.sh | sh
fi
nohup ollama serve > ollama.log 2>&1 &
sleep 5 # Ollama'nın tamamen ayağa kalkması için biraz bekliyoruz.

echo "[5/8] 📥 Yapay Zeka Modelleri indiriliyor (Bu işlem Colab internetiyle çok hızlı sürecektir)..."
# .env.example veya .env içindeki modelleri çekebiliriz, varsayılan olarak bge-m3 ve gemma:2b çekelim
ollama pull bge-m3
# .env dosyasında gemma4:e2b kullanılmış ama resmi repo'da gemma:2b veya gemma2:2b var. Güvenli olması için gemma:2b çekiyoruz.
ollama pull gemma:2b 

echo "[6/8] 🛠️ PM2, Serve ve Cloudflared global olarak kuruluyor..."
sudo npm install -g pm2 serve
wget -q -c -nc https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64
chmod +x cloudflared-linux-amd64

echo "[7/8] 📦 Proje bağımlılıkları (npm install) kuruluyor..."
npm install

echo "[8/8] 🚀 Proje servisleri arka planda başlatılıyor..."
# Ortam değişkenlerini ayarlamak için .env kopyası oluşturalım
if [ ! -f ".env" ]; then
    cp .env.example .env
    sed -i 's/OLLAMA_LLM_MODEL=.*/OLLAMA_LLM_MODEL=gemma:2b/g' .env
fi

# Arayüzü derleyip production (stabil) modda servis edelim
echo "Arayüz derleniyor (Bu biraz zaman alabilir)..."
npm run build

# Eski PM2 süreçlerini temizle ki port çakışması olmasın (Çok önemli!)
pm2 delete all || true

pm2 start npm --name "api" -- run dev:api
pm2 start npm --name "worker" -- run dev:worker
pm2 start npm --name "web" -- run dev:web

echo "=================================================="
echo "✅ Kurulum Tamamlandı! Tüm servisler (API, Web, Worker, Redis, Qdrant, Ollama) arka planda çalışıyor."
echo ""
echo "🌐 DIŞARIDAN ERİŞİM İÇİN SON ADIM:"
echo "Google Colab makinesine kendi bilgisayarından bağlanabilmek için aşağıdaki komutu Colab'de yeni bir kod hücresinde çalıştır:"
echo ""
echo "!./cloudflared-linux-amd64 tunnel --url http://localhost:5173"
echo ""
echo "Çıktıda 'https://.....trycloudflare.com' şeklinde bir link göreceksin. O linke tıklayarak arayüze doğrudan girebilirsin!"
echo "=================================================="
