#!/usr/bin/env bash
set -euo pipefail

echo "=================================================="
echo "🚀 Başlatılıyor: Esteworld POC Google Colab Kurulumu (A100 GPU)"
echo "=================================================="

# 1. Root dizini bulalım
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

# 0. GPU doğrulama
echo "[0/9] 🎮 GPU doğrulanıyor..."
nvidia-smi || echo "⚠️ UYARI: GPU algılanamadı! Ollama CPU modunda çalışacak."

# 1. Veri dosyası kontrolü
echo "[1/9] 📊 Esteworld veri dosyası kontrol ediliyor..."
if [ ! -f "data/esteworld-data/Aggregated_Patient_Logs.csv" ]; then
    echo "❌ HATA: Esteworld CSV verisi bulunamadı!"
    echo "Lütfen 'data/esteworld-data/Aggregated_Patient_Logs.csv' dosyasını Colab'a yükleyin."
    echo "Google Drive'dan mount edebilir veya doğrudan upload edebilirsiniz."
    exit 1
fi

echo "[2/9] 📦 Node.js 20, Redis ve Zstd kuruluyor..."
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs redis-server zstd

echo "[3/9] 🗄️ Redis servisi başlatılıyor..."
sudo service redis-server start

echo "[4/9] 🧠 Qdrant (Vektör DB) indiriliyor ve başlatılıyor..."
# Varsa eski qdrant sürecini sonlandır ki port çakışmasın
pkill -f qdrant || true
wget -q -O qdrant-x86_64-unknown-linux-gnu.tar.gz https://github.com/qdrant/qdrant/releases/download/v1.8.2/qdrant-x86_64-unknown-linux-gnu.tar.gz
tar -xzf qdrant-x86_64-unknown-linux-gnu.tar.gz
nohup ./qdrant > qdrant.log 2>&1 &
# Qdrant'ın tamamen başlaması için 3 saniye bekleyelim
sleep 3
echo "Qdrant arka planda çalışıyor."

echo "[5/9] 🤖 Ollama (Yapay Zeka Motoru) kuruluyor..."
if ! command -v ollama &> /dev/null; then
    curl -fsSL https://ollama.com/install.sh | sh
fi
nohup ollama serve > ollama.log 2>&1 &
sleep 5 # Ollama'nın tamamen ayağa kalkması için biraz bekliyoruz.

echo "[6/9] 📥 AI Modelleri indiriliyor (A100 GPU için optimize)..."
# bge-m3: 1024 boyutlu, çok dilli embedding modeli (A100 ile sorunsuz çalışır)
ollama pull bge-m3
# gemma4:e2b: MoE Expert-2B LLM — A100'de hızlı ve kaliteli
ollama pull gemma4:e2b

echo "[7/9] 🛠️ PM2, Serve ve Cloudflared global olarak kuruluyor..."
sudo npm install -g pm2 serve
wget -q -c -nc https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64
chmod +x cloudflared-linux-amd64

echo "[8/9] 📦 Proje bağımlılıkları (npm install) kuruluyor..."
npm install

echo "[9/9] 🚀 Proje servisleri başlatılıyor..."
# .env dosyası yoksa .env.example'dan oluştur (default'lar zaten A100'e uygun)
if [ ! -f ".env" ]; then
    cp .env.example .env
fi

# Gerçek Esteworld hasta verilerini Qdrant'a yükle
echo "Esteworld hasta verileri Qdrant vektör veritabanına yükleniyor..."
npm run seed:esteworld

# Eski PM2 süreçlerini temizle ki port çakışması olmasın (Çok önemli!)
pm2 delete all || true

pm2 start npm --name "api" -- run dev:api
pm2 start npm --name "worker" -- run dev:worker
pm2 start npm --name "web" -- run dev:web

# GPU doğrulama — model yüklü mü?
sleep 3
echo ""
echo "🎮 Ollama GPU kullanım durumu:"
ollama ps || true

echo "=================================================="
echo "✅ Kurulum Tamamlandı! (A100 GPU + Gerçek Esteworld Verisi)"
echo ""
echo "🌐 DIŞARIDAN ERİŞİM İÇİN SON ADIM:"
echo "Google Colab makinesine kendi bilgisayarından bağlanabilmek için aşağıdaki komutu Colab'de yeni bir kod hücresinde çalıştır:"
echo ""
echo "!./cloudflared-linux-amd64 tunnel --url http://localhost:5173"
echo ""
echo "Çıktıda 'https://.....trycloudflare.com' şeklinde bir link göreceksin. O linke tıklayarak arayüze doğrudan girebilirsin!"
echo "=================================================="
