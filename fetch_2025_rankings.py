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

    print("YOK Atlas API'sinden 2025 Basari Siralamalari cekiliyor...")
    
    rank_dict = {}
    page_size = 500
    current_page = 0
    total_elements = None
    
    # 21,602 kayıt olduğu için page_size=500 ile yaklaşık 44 sayfa sürecektir
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
                        
                        if code:
                            if sira is not None and str(sira).strip() not in ['', 'None', 'null', 'nan', '0']:
                                try:
                                    rank_dict[code] = int(float(str(sira).replace(' ', '').replace('.', '')))
                                except:
                                    rank_dict[code] = sira
                    
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
            
        # Son sayfaya gelip gelmedigimizi kontrol et
        # totalPages de kullanilabilir
        total_pages = data.get('totalPages', 0)
        if current_page >= total_pages - 1 or len(content) < page_size:
            break
            
        current_page += 1
        time.sleep(0.1)  # Sunucuyu yormamak icin cok ufak bir bekleme süresi

    print(f"\nVeri cekme islemi tamamlandi! Toplam {len(rank_dict)} programin 2025 siralamasi alindi.")
    
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
    for item in uni_data:
        code = str(item.get('yokAtlasKodu', '')).strip()
        if code in rank_dict:
            item['basariSirasi'] = rank_dict[code]
            matched_count += 1
        else:
            item['basariSirasi'] = '' # 2025 verisi yoksa bos kalsin

    print(f"Eslestirme tamamlandi: {len(uni_data)} programdan {matched_count} tanesi 2025 YKS siralamasi ile eslestirildi.")

    # 4. Kaydet
    with open(js_file, 'w', encoding='utf-8') as f:
        f.write('const universiteVerileri = ')
        json.dump(uni_data, f, ensure_ascii=False, indent=4)
        f.write(';')
        
    print("Kaydedildi! Sitenizdeki tum veriler 2025 YKS siralamalari ile basariyla guncellendi.")

if __name__ == '__main__':
    fetch_and_merge()
