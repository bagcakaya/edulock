import pandas as pd
import json
import os

def merge_rankings():
    js_file = 'universiteler.js'
    csv_file = 'tum_bolumler.csv'
    
    if not os.path.exists(csv_file):
        print(f"HATA: {csv_file} dosyasi bulunamadi.")
        return
        
    print(f"Siralama dosyasi okunuyor: {csv_file}")
    
    try:
        # Kodlari ve siralamalari string/sayi olarak duzgun okumak icin
        df_rank = pd.read_csv(csv_file, dtype={'id': str})
    except Exception as e:
        print(f"{csv_file} okuma hatasi: {e}")
        return

    # Sutun isimlerini temizle
    df_rank.columns = [c.strip() for c in df_rank.columns]
    
    # Eslestirme icin id sutununu ve siralama sutunlarini kontrol et
    if 'id' not in df_rank.columns:
        print("HATA: csv dosyasinda 'id' sutunu bulunamadi.")
        return
        
    # En guncel yil olan 2024 siralamasini alacagiz, yoksa sirasiyla 2023, 2022'ye bakacagiz
    print("id sutunu bulundu. Siralama eslestirmesi basliyor...")

    # Arama kolayligi icin bir sozluk olusturalim
    rank_dict = {}
    for _, row in df_rank.iterrows():
        prog_id = str(row['id']).strip()
        
        # En guncel siralamayi bulmaya calis
        sira = None
        for year in ['2024', '2023', '2022', '2021']:
            col_name = f'sira{year}'
            if col_name in df_rank.columns:
                val = row[col_name]
                if not pd.isna(val) and str(val).strip() not in ['', '--', '0', '0.0', 'nan']:
                    try:
                        sira = int(float(str(val).replace(' ', '').replace('.', '')))
                        break  # En guncel yili buldugumuzda donguden cik
                    except:
                        pass
        
        if sira is not None:
            rank_dict[prog_id] = sira

    # 3. universiteler.js dosyasini oku
    if not os.path.exists(js_file):
        print(f"HATA: {js_file} dosyasi bulunamadi.")
        return

    with open(js_file, 'r', encoding='utf-8') as f:
        content = f.read()
    
    # JSON verisini ayikla
    try:
        json_str = content.replace('const universiteVerileri = ', '').rstrip(';').strip()
        uni_data = json.loads(json_str)
    except Exception as e:
        print(f"{js_file} ayristirma hatasi: {e}")
        return

    # 4. Verileri guncelle
    matched_count = 0
    for item in uni_data:
        code = str(item.get('yokAtlasKodu', '')).strip()
        if code in rank_dict:
            item['basariSirasi'] = rank_dict[code]
            matched_count += 1
        else:
            item['basariSirasi'] = '' # Bulunamadiysa bos kalsin

    print(f"Eslestirme tamamlandi: {len(uni_data)} programdan {matched_count} tanesi basariyla eslestirildi.")

    # 5. Tekrar universiteler.js olarak kaydet
    with open(js_file, 'w', encoding='utf-8') as f:
        f.write('const universiteVerileri = ')
        json.dump(uni_data, f, ensure_ascii=False, indent=4)
        f.write(';')
        
    print(f"Basariyla kaydedildi! {js_file} guncellendi.")

if __name__ == '__main__':
    merge_rankings()
