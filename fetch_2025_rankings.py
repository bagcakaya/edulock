import httpx
import json
import os
import time

def fetch_and_merge():
    url = "https://yokatlas.yok.gov.tr/api/tercih-kilavuz/search"
    headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Content-Type": "application/json"
    }
    
    js_file = 'universiteler.js'
    if not os.path.exists(js_file):
        print(f"HATA: {js_file} dosyasi bulunamadi.")
        return

    print("YOK Atlas API'sinden 2025 Basari Siralamalari ve Ilce Yerleske bilgileri cekiliyor...")
    
    rank_dict = {}
    page_size = 500
    current_page = 0
    total_elements = None
    
    while True:
        payload = {
            "filters": {
                "puanTuru": None,
                "universiteId": [],
                "birimGrupId": [],
                "ilKodu": [],
                "birimTuruId": None,
                "universiteTuru": None,
                "bursOraniId": None,
                "ogrenimTuruId": None,
                "kilavuzKodu": None,
                "minBasariSirasi": None,
                "maxBasariSirasi": None
            },
            "page": current_page,
            "size": page_size,
            "sortBy": "basariSirasi",
            "direction": "ASC"
        }
        
        print(f"Sayfa {current_page} indiriliyor...", end="", flush=True)
        
        retries = 3
        success = False
        while retries > 0:
            try:
                response = httpx.post(url, json=payload, headers=headers, timeout=20)
                if response.status_code == 200:
                    data = response.json()
                    if total_elements is None:
                        total_elements = data.get('totalElements', 0)
                        print(f" (Toplam {total_elements} program bulunuyor)")
                    
                    content = data.get('content', [])
                    for prog in content:
                        code = str(prog.get('kilavuzKodu', '')).strip()
                        sira = prog.get('basariSirasi')
                        ilce = prog.get('fymkIlceAdi')
                        
                        # Ilce adini duzgun formatlayalim (örn: KOCASINAN -> Kocasinan)
                        konum = ""
                        if ilce and str(ilce).strip() not in ['', 'None', 'null', 'nan']:
                            # Turkce i/I donusumlerini dikkate alarak capitalize yapalim
                            ilce_str = str(ilce).strip()
                            # Basit bas harf buyutme
                            if len(ilce_str) > 0:
                                ilce_clean = ilce_str[0].upper() + ilce_str[1:].lower()
                            else:
                                ilce_clean = ilce_str
                            
                            # MERKEZ veya Merkez kelimesini guzellestirelim
                            if ilce_clean.lower() == 'merkez':
                                konum = "Merkez Yerleşkesi"
                            else:
                                konum = f"{ilce_clean} Yerleşkesi"
                        
                        sira_val = ""
                        if sira is not None and str(sira).strip() not in ['', 'None', 'null', 'nan', '0']:
                            try:
                                sira_val = int(float(str(sira).replace(' ', '').replace('.', '')))
                            except:
                                sira_val = sira
                        
                        if code:
                            rank_dict[code] = {
                                'sira': sira_val,
                                'konum': konum
                            }
                    
                    print(f" -> {len(content)} bolum okundu.")
                    success = True
                    break
                else:
                    print(f" [Hata Kodu: {response.status_code}] Yeniden deneniyor...", end="", flush=True)
                    retries -= 1
                    time.sleep(1)
            except Exception as e:
                print(f" [Hata: {e}] Yeniden deneniyor...", end="", flush=True)
                retries -= 1
                time.sleep(1)
                
        if not success:
            print("\n❌ HATA: Sayfa cekilemedi, islem iptal ediliyor.")
            return
            
        total_pages = data.get('totalPages', 0)
        if current_page >= total_pages - 1 or len(content) < page_size:
            break
            
        current_page += 1
        time.sleep(0.1)

    print(f"\nVeri cekme islemi tamamlandi! Toplam {len(rank_dict)} programin bilgisi alindi.")
    
    # 3. universiteler.js dosyasini oku ve guncelle
    print(f"universiteler.js dosyasi yukleniyor ve guncelleniyor...")
    with open(js_file, 'r', encoding='utf-8') as f:
        content_js = f.read()
        
    try:
        json_str = content_js.replace('const universiteVerileri = ', '').rstrip(';').strip()
        uni_data = json.loads(json_str)
    except Exception as e:
        print(f"HATA: universiteler.js ayrilamadi: {e}")
        return

    matched_count = 0
    konum_updated = 0
    for item in uni_data:
        code = str(item.get('yokAtlasKodu', '')).strip()
        if code in rank_dict:
            info = rank_dict[code]
            item['basariSirasi'] = info['sira']
            
            # Yerleske konumunu ilce duzeyinde guncelle
            new_konum = info['konum']
            if new_konum:
                if 'detaylar' not in item or not isinstance(item['detaylar'], dict):
                    item['detaylar'] = {
                        "konum": new_konum,
                        "yurt": "GSB Haritada Gör",
                        "mesafe": "Değişken",
                        "ogrenciDostu": "Veri Yok"
                    }
                else:
                    item['detaylar']['konum'] = new_konum
                konum_updated += 1
            
            matched_count += 1
        else:
            item['basariSirasi'] = '' # 2025 verisi yoksa bos kalsin

    print(f"Eslestirme tamamlandi: {len(uni_data)} programdan {matched_count} tanesi 2025 YKS siralamasi ile eslestirildi.")
    print(f"Toplam {konum_updated} programin kampys konumu ilce bazli yerleske olarak guncellendi.")

    # 4. Kaydet
    with open(js_file, 'w', encoding='utf-8') as f:
        f.write('const universiteVerileri = ')
        json.dump(uni_data, f, ensure_ascii=False, indent=4)
        f.write(';')
        
    print("Kaydedildi! Sitenizdeki tum veriler 2025 YKS siralamalari ve ilce yerleske konumlari ile basariyla guncellendi.")

if __name__ == '__main__':
    fetch_and_merge()
