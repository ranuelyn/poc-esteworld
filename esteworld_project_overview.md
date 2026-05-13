# Esteworld AI Sales Copilot — Full Project Overview

> **Amaç**: Bu döküman, projenin mevcut PoC halini, hedeflenen üretim versiyonunu, teknik altyapıyı ve deployment maliyetlerini kapsamlı şekilde özetler. Derin araştırma ve karar alma süreçlerinde referans olarak kullanılabilir.

---

## 1. Proje Vizyonu

Sağlık turizmi sektöründe (özellikle Esteworld klinikleri için) **WhatsApp/Instagram üzerinden gelen hasta mesajlarını gerçek zamanlı analiz eden**, satış danışmanlarına:

- 🎯 **Lead sıcaklığı** (Cold/Warm/Hot) ve **lead skoru** (0-100) veren
- 🔄 **11 aşamalı satış funnel'ında** hastanın nerede olduğunu belirleyen
- 💬 **3 farklı tonda yanıt önerisi** (Professional / Warm & Trust / Closing) üreten
- 📊 **Next Best Action** önererek** satışı kapatma yolunda rehberlik eden
- 🔍 **RAG (Retrieval-Augmented Generation)** ile geçmiş başarılı konuşmalardan öğrenen

bir **AI Satış Asistanı (Copilot)** sistemidir.

---

## 2. Mevcut PoC Durumu

### 2.1 Mimari

```
┌─────────────────────────────────────────────────────────────────┐
│                        FRONTEND (React + Vite)                  │
│  ┌──────────────┐ ┌──────────────┐ ┌──────────────────────────┐ │
│  │ Sales Copilot│ │Admin Dashboard│ │  Qdrant RAG Viewer       │ │
│  └──────────────┘ └──────────────┘ └──────────────────────────┘ │
└────────────────────────────┬────────────────────────────────────┘
                             │ HTTP API
┌────────────────────────────▼────────────────────────────────────┐
│                     BACKEND (Node.js + TypeScript)               │
│  ┌─────────────────┐  ┌──────────────────┐  ┌────────────────┐ │
│  │ Express API      │  │ BullMQ Worker    │  │ Use Cases      │ │
│  │ (routes.ts)      │  │ (chatWorker.ts)  │  │ ProcessChat... │ │
│  └─────────────────┘  └──────────────────┘  └────────────────┘ │
│           │                    │                     │          │
│  ┌────────▼────────┐  ┌───────▼───────┐  ┌──────────▼────────┐│
│  │ Redis (Queue)   │  │ Ollama (LLM)  │  │ Qdrant (Vector)   ││
│  │ BullMQ jobs     │  │ Gemma model   │  │ RAG embeddings    ││
│  └─────────────────┘  └───────────────┘  └───────────────────┘│
└────────────────────────────────────────────────────────────────┘
```

### 2.2 Tech Stack (PoC)

| Katman | Teknoloji | Detay |
|--------|-----------|-------|
| **Frontend** | React 18 + Vite + TypeScript | SPA, chat UI, RAG viewer, admin dashboard |
| **Backend** | Node.js 20 + Express + TypeScript | REST API, webhook handler |
| **Job Queue** | BullMQ + Redis | Async mesaj işleme, concurrency kontrol |
| **LLM (Ana Beyin)** | Ollama → Gemma 4 e2b | Analiz, funnel tespiti, yanıt önerisi |
| **LLM (Simülatör)** | Google Gemini API | Sadece test: sahte müşteri simülasyonu |
| **Embedding** | Ollama → BGE-M3 (1024d) | Mesaj → vektör dönüşümü |
| **Vector DB** | Qdrant (Docker) | RAG araması, similarity search |
| **Cache/Queue** | Redis (Docker) | BullMQ job queue backend |
| **Data Source** | Aggregated_Patient_Logs.csv | 528 gerçek hasta konuşması (Esteworld) |

### 2.3 Core Özellikler (Çalışan)

| Özellik | Açıklama | Durum |
|---------|----------|-------|
| **RAG Pipeline** | Mesaj → Embed → Qdrant benzer konuşma ara → LLM'e ver → Analiz | ✅ Çalışıyor |
| **Sliding Window Chunking** | Her hasta konuşması 10-mesajlık pencerelerle chunk'lanıyor (3 overlap) | ✅ Çalışıyor |
| **11-Stage Funnel** | Esteworld'ün resmi satış funnel'ı AI prompt'a gömülü | ✅ Çalışıyor |
| **Lead Scoring** | 0-100 arası lead skoru, cold/warm/hot temperature | ✅ Çalışıyor |
| **3-Tone Replies** | Professional / Warm & Trust / Closing tonda yanıt önerisi | ✅ Çalışıyor |
| **Follow-up Templates** | No Response 1-2-3-4 şablonları (son %20 indirim dahil) | ✅ Prompt'ta |
| **Qdrant RAG Viewer** | Qdrant'ta hangi verilerin olduğunu, dağılımları gösteren UI | ✅ Çalışıyor |
| **Real Case Demo** | Gerçek hasta konuşmasını yükleyip yeni mesajla RAG test etme | ✅ Çalışıyor |
| **Admin Dashboard** | Aktif lead'leri, durumlarını izleme paneli | ✅ Çalışıyor |

### 2.4 Veri Kaynakları

| Dosya | İçerik | RAG'da mı? | AI Prompt'ta mı? |
|-------|--------|------------|-------------------|
| `Aggregated_Patient_Logs.csv` (11.4 MB) | 528 gerçek hasta konuşması, ~200K+ mesaj | ✅ Evet (chunk'lanmış) | Hayır |
| `FUNNEL TEMPERATURE ANALYSIS.docx` | 11-aşamalı funnel, No Response şablonları, follow-up kuralları | Hayır | ✅ Evet (system prompt) |
| `Esteworld Funnel Temperature Analysis.pdf` | Aynı dokümanın PDF versiyonu | Hayır | ✅ Evet (system prompt) |

### 2.5 Bilinen Kısıtlamalar (PoC)

- **Model**: Gemma 4 e2b (küçük model), karmaşık analizlerde yetersiz kalabiliyor
- **Seed Süresi**: Ollama ile embedding çok yavaş (~30 hasta için 5-10 dk)
- **Veri Kapsamı**: 528 hastanın tamamı değil, en zengin 30 hasta seed ediliyor
- **Entegrasyon Yok**: Zoho CRM ve Wazzup henüz entegre değil (mock)
- **Tek Tenant**: Sadece Esteworld Istanbul için yapılandırılmış
- **Ölçeklenebilirlik**: Tek makine, tek GPU — horizontal scaling yok

---

## 3. Hedef Üretim Versiyonu

### 3.1 Mimari Değişiklikler

```
┌─────────────────────────────────────────────────────────────────────┐
│                      PRODUCTION ARCHITECTURE                        │
│                                                                     │
│  ┌────────────┐   ┌─────────────────────┐   ┌───────────────────┐  │
│  │ Wazzup API │──▶│  Webhook Gateway    │──▶│  Message Queue    │  │
│  │ (WhatsApp) │   │  (Load Balancer)    │   │  (Redis Cluster)  │  │
│  └────────────┘   └─────────────────────┘   └────────┬──────────┘  │
│                                                       │             │
│  ┌────────────┐   ┌─────────────────────┐   ┌────────▼──────────┐  │
│  │ Zoho CRM   │◀──│  Lead Sink Service  │◀──│  AI Worker Pool   │  │
│  │ Webhook    │   │  (Assessment Push)  │   │  (Gemma 27B)      │  │
│  └────────────┘   └─────────────────────┘   └────────┬──────────┘  │
│                                                       │             │
│                   ┌─────────────────────┐   ┌────────▼──────────┐  │
│                   │  Qdrant Cluster     │◀──│  Embedding Service│  │
│                   │  (Managed/Self)     │   │  (BGE-M3 / E5)    │  │
│                   └─────────────────────┘   └───────────────────┘  │
│                                                                     │
│  ┌──────────────────────────────────────────────────────────────┐   │
│  │                    Dashboard (React)                          │   │
│  │  Sales Copilot  |  Admin Panel  |  RAG Viewer  |  Analytics  │   │
│  └──────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────┘
```

### 3.2 Üretim Tech Stack

| Katman | PoC | Üretim | Neden? |
|--------|-----|--------|--------|
| **LLM** | Gemma 4 e2b (~2B) | **Gemma 2 27B** (Q4_K_M) | Daha derin analiz, daha iyi Türkçe/Arapça, daha tutarlı JSON |
| **GPU** | MacBook (CPU) | **NVIDIA A10G/L4/A100** (24-48GB VRAM) | 27B modeli GPU'da çalıştırmak şart |
| **Embedding** | Ollama BGE-M3 | **GPU-accelerated BGE-M3** veya E5-large | Seed süresini 10x hızlandırır |
| **Vector DB** | Qdrant (Docker local) | **Qdrant Cloud** veya self-hosted cluster | Yüksek erişilebilirlik, yedekleme |
| **Queue** | Redis (Docker local) | **Redis Cloud / ElastiCache** | Persistent queue, failover |
| **Messaging** | Mock API | **Wazzup API** (WhatsApp Business) | Gerçek müşteri mesajları |
| **CRM** | InMemory sink | **Zoho CRM** webhook | Lead'leri CRM'e otomatik push |
| **Hosting** | localhost | **AWS / RunPod / GCP** | Production-grade uptime |
| **Data** | 30 hasta (partial CSV) | **528+ hasta (tam CSV)** + canlı veri | Sürekli büyüyen RAG |

---

## 4. Deployment Platformları ve Maliyet Analizi

### 4.1 Gemma 27B Donanım Gereksinimleri

| Quantization | Model Boyutu | Minimum VRAM | Önerilen VRAM | Token/sn (tahmini) |
|-------------|-------------|-------------|--------------|---------------------|
| **Q4_K_M** | ~17 GB | 20 GB | **24 GB** | ~20-40 t/s |
| **Q8_0** | ~30 GB | 32 GB | **40+ GB** | ~15-25 t/s |
| **FP16** | ~54 GB | 56 GB | **80 GB** | ~10-15 t/s |

> **Önerimiz**: Q4_K_M quantization ile **24 GB VRAM** yeterli. Bu, maliyet/performans açısından en iyi denge.

### 4.2 Platform Karşılaştırması

#### 🟠 AWS (Amazon Web Services)

| Instance | GPU | VRAM | vCPU | RAM | Fiyat (on-demand) | Aylık (~730 saat) |
|----------|-----|------|------|-----|-------------------|-------------------|
| **g5.xlarge** | 1× A10G | 24 GB | 4 | 16 GB | ~$1.01/saat | **~$737/ay** |
| **g5.2xlarge** | 1× A10G | 24 GB | 8 | 32 GB | ~$1.21/saat | **~$883/ay** |
| **g6.xlarge** | 1× L4 | 24 GB | 4 | 16 GB | ~$0.80/saat | **~$584/ay** |
| **g6.2xlarge** | 1× L4 | 24 GB | 8 | 32 GB | ~$0.98/saat | **~$715/ay** |
| **p4d.24xlarge** | 8× A100 | 320 GB | 96 | 1.1 TB | ~$32.77/saat | Overkill |

**AWS Avantajları:**
- ✅ Enterprise-grade güvenilirlik ve SLA
- ✅ ElastiCache (Redis), managed Qdrant ile entegrasyon kolay
- ✅ Deep Learning AMI ile Ollama/CUDA hazır
- ✅ Auto-scaling, CloudWatch monitoring
- ✅ Spot instances ile %60-70 tasarruf (dev/test ortamı için)
- ✅ 1-3 yıllık Savings Plan ile %30-40 indirim

**AWS Dezavantajları:**
- ❌ En pahalı seçenek (on-demand)
- ❌ GPU instance kotaları başvuru gerektirebilir
- ❌ Karmaşık billing ve ek hizmet maliyetleri

> **AWS Öneri**: Dev/Test için `g6.xlarge` Spot ($175-250/ay), Üretim için `g5.2xlarge` on-demand veya Reserved (~$580/ay)

---

#### 🟣 Google Cloud Platform (GCP)

| Instance | GPU | VRAM | Fiyat (on-demand) | Aylık |
|----------|-----|------|-------------------|-------|
| **g2-standard-4** | 1× L4 | 24 GB | ~$0.70/saat | **~$511/ay** |
| **g2-standard-8** | 1× L4 | 24 GB | ~$0.85/saat | **~$620/ay** |
| **a2-highgpu-1g** | 1× A100 40GB | 40 GB | ~$3.67/saat | **~$2,679/ay** |

**GCP Avantajları:**
- ✅ Gemma Google'ın modeli — en iyi Gemma desteği burada
- ✅ GKE (Kubernetes) ile container orchestration
- ✅ Vertex AI ile Gemma 27B'yi managed endpoint olarak çalıştırabilirsiniz (API olarak)
- ✅ Spot VM'ler ile %60-91 indirim

**GCP Dezavantajları:**
- ❌ A100 çok pahalı, L4 yeterli olmalı
- ❌ GPU kotası başvurusu gerekir

> **GCP Öneri**: `g2-standard-8` (L4) en uygun fiyat/performans

---

#### 🟢 RunPod (GPU Cloud)

| GPU | VRAM | Community Cloud | Secure Cloud | Aylık (Community, 24/7) |
|-----|------|----------------|-------------|------------------------|
| **L40S** | 48 GB | ~$0.70-0.99/saat | ~$1.20/saat | **~$511-723/ay** |
| **A100 80GB** | 80 GB | ~$0.89-1.39/saat | ~$1.89/saat | **~$650-1,015/ay** |
| **RTX 4090** | 24 GB | ~$0.35-0.44/saat | — | **~$255-321/ay** |

**RunPod Avantajları:**
- ✅ **En kolay kurulum** — Template'lerden Ollama hazır
- ✅ Serverless mode: kullanmadığınız zaman ödeme yok (scale-to-zero)
- ✅ RTX 4090 ile en düşük maliyet ($255/ay)
- ✅ Pod'da Qdrant + Redis + Backend hepsini çalıştırabilirsiniz

**RunPod Dezavantajları:**
- ❌ Community Cloud güvenilirlik garantisi yok
- ❌ Enterprise SLA sadece Secure Cloud'da
- ❌ Veri gizliliği endişesi (paylaşımlı donanım)

> **RunPod Öneri**: PoC/Demo için `RTX 4090 Community` ($255/ay), Üretim için `L40S Secure` ($876/ay)

---

#### 🔵 Vast.ai (GPU Marketplace)

| GPU | VRAM | Tipik Fiyat | Aylık |
|-----|------|------------|-------|
| **RTX 4090** | 24 GB | ~$0.25-0.40/saat | **~$183-292/ay** |
| **A100 40GB** | 40 GB | ~$0.60-0.90/saat | **~$438-657/ay** |
| **L40S** | 48 GB | ~$0.55-0.80/saat | **~$401-584/ay** |

**Vast.ai Avantajları:**
- ✅ **En ucuz seçenek** — marketplace modeli
- ✅ R&D ve test için ideal

**Vast.ai Dezavantajları:**
- ❌ Güvenilirlik garantisi yok — instance herhangi bir an kapatılabilir
- ❌ Üretim kullanımı riskli
- ❌ Veri güvenliği endişesi yüksek (sağlık verileri!)

> **Vast.ai Öneri**: Sadece geliştirme/test ortamı. Üretim için uygun **DEĞİL** (sağlık verileri).

---

### 4.3 Maliyet Özet Tablosu

| Senaryo | Platform | GPU | Aylık GPU | + Qdrant | + Redis | + Domain/SSL | **Toplam** |
|---------|----------|-----|-----------|----------|---------|-------------|------------|
| **Dev/Test (Minimum)** | RunPod Community | RTX 4090 | $255 | Self-hosted (dahil) | Self-hosted (dahil) | $10 | **~$265/ay** |
| **Demo/Pilot** | AWS g6.xlarge Spot | L4 | ~$200 | Qdrant Cloud Free | ElastiCache ($15) | $10 | **~$225/ay** |
| **Üretim (Başlangıç)** | AWS g5.2xlarge | A10G | $883 | Qdrant Cloud ($50) | ElastiCache ($50) | $20 | **~$1,003/ay** |
| **Üretim (Optimal)** | GCP g2-standard-8 | L4 | $620 | Qdrant Cloud ($50) | Memorystore ($30) | $20 | **~$720/ay** |
| **Üretim (Premium)** | RunPod Secure L40S | L40S | $876 | Qdrant Cloud ($100) | Redis Cloud ($30) | $20 | **~$1,026/ay** |

### 4.4 Ek Servis Maliyetleri (Entegrasyonlar)

| Servis | Fiyat | Not |
|--------|-------|-----|
| **Wazzup** (WhatsApp Business) | $45-90/ay/kanal | PRO veya MAX plan önerilir |
| **Meta WhatsApp Konuşma** | ~$0.05-0.15/konuşma | Meta'nın WABA ücretleri (bölgeye göre değişir) |
| **Zoho CRM** | $40-65/ay/kullanıcı | Enterprise plan gerekli (webhook desteği) |
| **Domain + SSL** | $10-20/ay | Cloudflare veya AWS Route53 |
| **Monitoring** | $0-50/ay | Grafana Cloud free tier veya Datadog |

---

## 5. Entegrasyon Yol Haritası

### Faz 1: PoC ✅ (Mevcut Durum)
- [x] Esteworld CSV → RAG (sliding window chunking)
- [x] Funnel Temperature Analysis → AI system prompt
- [x] Gemma (Ollama) ile analiz
- [x] 11-aşamalı funnel detection
- [x] Qdrant RAG Viewer
- [x] Real Case demo testi
- [x] Lead scoring ve temperature

### Faz 2: Demo & Pilot (Sonraki Adımlar)
- [ ] GPU sunucuya deploy (RunPod/AWS)
- [ ] Gemma 27B'ye geçiş
- [ ] Tam CSV seed (528 hasta)
- [ ] Wazzup webhook entegrasyonu (gerçek WhatsApp mesajları)
- [ ] Zoho CRM'e lead push
- [ ] SSL + domain + production build

### Faz 3: Üretim
- [ ] Multi-tenant mimari (birden fazla klinik)
- [ ] Canlı veri ile RAG'ı sürekli güncelleme
- [ ] A/B test: farklı reply tonları karşılaştırma
- [ ] Satış performans analytics
- [ ] KVKK/GDPR uyumluluk (sağlık verileri şifreleme)
- [ ] Horizontal scaling (birden fazla worker)
- [ ] Aftercare & post-op follow-up otomasyonu

---

## 6. "Plug and Play" Cevabı

> **Soru**: AWS'de direkt plug-in-play çalıştırabilir miyiz?

**Kısa cevap: Evet, neredeyse.**

AWS'de `g5.xlarge` veya `g6.xlarge` instance alıp:
1. Deep Learning AMI seçin (CUDA + NVIDIA drivers hazır)
2. `ollama pull gemma2:27b-instruct-q4_K_M` ile modeli indir
3. Docker ile Qdrant + Redis çalıştır
4. `git clone` + `npm install` + `npm run seed` + `npm start`

Bu akış ~30 dakikada hazır olur. Zaten Colab'da benzer bir akışı `scripts/colab-setup.sh` ile yapmıştık. AWS için de aynı script uyarlanabilir.

**En hızlı yol**: RunPod'da bir Pod açıp Ollama template'i seç, SSH ile bağlan, projeyi klonla. 5 dakikada hazır.

---

## 7. Önerilen Strateji

| Aşama | Platform | Maliyet | Süre |
|-------|----------|---------|------|
| **PoC Sunumu** | Localhost (MacBook) veya Google Colab T4 | $0 | Hazır |
| **Esteworld Demo** | RunPod RTX 4090 Community | ~$265/ay | 1-2 gün kurulum |
| **Pilot (3 ay)** | AWS g6.xlarge + Qdrant Cloud | ~$650/ay | 1 hafta kurulum |
| **Üretim** | AWS g5.2xlarge Reserved + Qdrant Cloud + Redis | ~$750/ay (reserved) | 2-4 hafta |

---

## 8. Kritik Kararlar

> [!IMPORTANT]
> ### Sağlık Verisi Güvenliği
> Esteworld hasta verilerini barındırıyorsunuz. KVKK ve GDPR kapsamında:
> - Verilerin EU/TR dışına çıkmaması gerekebilir → **eu-west-1** (İrlanda) veya **eu-central-1** (Frankfurt) region seçin
> - Paylaşımlı GPU platformları (Vast.ai) riskli → AWS/GCP tercih edin
> - Veritabanı şifreleme (at rest + in transit) zorunlu

> [!WARNING]
> ### Gemma 27B Lisansı
> Google Gemma modeli ticari kullanıma açık (Apache 2.0 benzeri lisans) ancak "Google'ın Acceptable Use Policy"sine tabi. Sağlık alanında kullanımda dikkatli olun — model tıbbi tavsiye üretmemeli, sadece satış süreci analizi yapmalı (mevcut prompt bunu yapıyor).

> [!TIP]
> ### Maliyet Optimizasyonu
> - GPU'yu sadece mesai saatlerinde çalıştırın (8:00-20:00 TR saati) → Maliyeti %50 düşürür
> - Embedding'ler için ayrı, ucuz bir GPU kullanın (RTX 3060 yeterli)
> - Qdrant'ın Binary Quantization özelliğini kullanarak RAM tasarrufu yapın
