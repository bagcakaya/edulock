import pandas as pd
import json
import re

def clean_score(score):
    if pd.isna(score) or str(score).strip() == '--' or str(score).strip() == '':
        return ''
    try:
        return float(str(score).replace(',', '.'))
    except:
        return score

turkiye_iller = [
    "Adana", "Adıyaman", "Afyonkarahisar", "Ağrı", "Amasya", "Ankara", "Antalya", "Artvin", "Aydın", "Balıkesir", "Bilecik", "Bingöl", "Bitlis", "Bolu", "Burdur", "Bursa", "Çanakkale", "Çankırı", "Çorum", "Denizli", "Diyarbakır", "Edirne", "Elazığ", "Erzincan", "Erzurum", "Eskişehir", "Gaziantep", "Giresun", "Gümüşhane", "Hakkari", "Hatay", "Isparta", "Mersin", "İstanbul", "İzmir", "Kars", "Kastamonu", "Kayseri", "Kırklareli", "Kırşehir", "Kocaeli", "Konya", "Kütahya", "Malatya", "Manisa", "Kahramanmaraş", "Mardin", "Muğla", "Muş", "Nevşehir", "Niğde", "Ordu", "Rize", "Sakarya", "Samsun", "Siirt", "Sinop", "Sivas", "Tekirdağ", "Tokat", "Trabzon", "Tunceli", "Şanlıurfa", "Uşak", "Van", "Yozgat", "Zonguldak", "Aksaray", "Bayburt", "Karaman", "Kırıkkale", "Batman", "Şırnak", "Bartın", "Ardahan", "Iğdır", "Yalova", "Karabük", "Kilis", "Osmaniye", "Düzce"
]

def extract_city(uni_name):
    uni_name_clean = str(uni_name).strip()
    
    # 1. Parantez içindeki ili yakala
    match = re.search(r'\((.*?)\)$', uni_name_clean)
    city = ''
    if match:
        city = match.group(1).strip()
        if '-' in city: # KKTC-LEFKOŞA gibi durumlar için
            city = city.split('-')[-1].strip()
    
    if not city or city == '':
        # 2. Üniversite ismi içinde il isimlerini ara
        name_upper = uni_name_clean.upper().replace('İ', 'I').replace('Ş', 'S').replace('Ğ', 'G').replace('Ü', 'U').replace('Ö', 'O').replace('Ç', 'C')
        for il in turkiye_iller:
            il_upper = il.upper().replace('İ', 'I').replace('Ş', 'S').replace('Ğ', 'G').replace('Ü', 'U').replace('Ö', 'O').replace('Ç', 'C')
            if il_upper in name_upper:
                city = il
                break
    
    if not city:
        return 'Belirtilmemiş'

    # Sadece harf ve boşluk bırak (Görünmeyen karakterleri temizle)
    city = "".join(c for c in city if c.isalpha() or c.isspace())
    return city.strip().capitalize().replace("i", "i").replace("I", "I") # Basit capitalize

uniar_notlari = {
    "Eskişehir": "A+ (Çok Yüksek Memnuniyet)",
    "Ankara": "A+ (Çok Yüksek Memnuniyet)",
    "Antalya": "A+ (Çok Yüksek Memnuniyet)",
    "Çanakkale": "A+ (Çok Yüksek Memnuniyet)",
    "Muğla": "A+ (Çok Yüksek Memnuniyet)",
    "İstanbul": "A+ (Çok Yüksek Memnuniyet)",
    "Aydın": "A+ (Çok Yüksek Memnuniyet)",
    "Edirne": "A+ (Çok Yüksek Memnuniyet)",
    "Tekirdağ": "A+ (Çok Yüksek Memnuniyet)",
    "İzmir": "A (Yüksek Memnuniyet)",
    "Samsun": "A (Yüksek Memnuniyet)",
    "Trabzon": "A (Yüksek Memnuniyet)",
    "Bursa": "A (Yüksek Memnuniyet)",
    "Isparta": "A (Yüksek Memnuniyet)",
    "Balıkesir": "A (Yüksek Memnuniyet)",
    "Manisa": "A (Yüksek Memnuniyet)",
    "Kocaeli": "A (Yüksek Memnuniyet)",
    "Denizli": "A (Yüksek Memnuniyet)",
    "Kırklareli": "A (Yüksek Memnuniyet)",
    "Kayseri": "B (Tatmin Edici)",
    "Yalova": "B (Tatmin Edici)",
    "Ordu": "B (Tatmin Edici)",
    "Sakarya": "B (Tatmin Edici)",
    "Kütahya": "B (Tatmin Edici)",
    "Zonguldak": "B (Tatmin Edici)",
    "Nevşehir": "B (Tatmin Edici)",
    "Kırşehir": "B (Tatmin Edici)",
    "Karabük": "B (Tatmin Edici)",
    "Mersin": "C (Ortalama)",
    "Bolu": "C (Ortalama)",
    "Afyonkarahisar": "C (Ortalama)",
    "Sivas": "C (Ortalama)",
    "Amasya": "C (Ortalama)",
    "Bartın": "C (Ortalama)",
    "Erzincan": "C (Ortalama)",
    "Burdur": "C (Ortalama)",
    "Düzce": "C (Ortalama)",
    "Kırıkkale": "C (Ortalama)",
}

def get_uniar(sehir):
    # Eşleşme için normalleştirme
    for key, value in uniar_notlari.items():
        if key.lower().replace('i', 'i').replace('ı', 'i') == sehir.lower().replace('i', 'i').replace('ı', 'i'):
            return value
    return "D (Düşük Memnuniyet)"

def convert_excel_to_js():
    print("Excel dosyaları yükleniyor, lütfen bekleyin (bu işlem birkaç saniye sürebilir)...")
    
    # Her iki Excel'i de oku (Başlıklar 3. satırda, yani index 2'de)
    try:
        df_4 = pd.read_excel('4 Yıllık Üniversite.xlsx', skiprows=2)
        df_2 = pd.read_excel('2 Yıllık Üniversite.xlsx', skiprows=2)
    except Exception as e:
        print(f"Hata: Excel dosyaları okunamadı. Detay: {e}")
        return

    # İki tabloyu birleştir
    df = pd.concat([df_4, df_2], ignore_index=True)
    
    # Gereksiz/Boş satırları filtrele (Program Kodu boşsa muhtemelen geçerli veri değildir)
    df = df.dropna(subset=['Program Kodu'])
    
    json_data = []
    
    for _, row in df.iterrows():
        uni_name = str(row.get('Üniversite Adı', ''))
        
        item = {
            "universite": uni_name,
            "sehir": extract_city(uni_name),
            "bolum": str(row.get('Program Adı', '')),
            "puanTuru": str(row.get('Puan Türü', '')),
            "tabanPuan": clean_score(row.get('En Küçük Puan')),
            "tavanPuan": clean_score(row.get('En Büyük Puan')),
            "kontenjan": str(row.get('Kontenjan', '')),
            "yokAtlasKodu": str(row.get('Program Kodu', '')).replace('.0', ''),
            "detaylar": {
                "konum": extract_city(uni_name) + " Kampüsü",
                "yurt": "GSB Haritada Gör",
                "mesafe": "Değişken",
                "ogrenciDostu": get_uniar(extract_city(uni_name))
            }
        }
        json_data.append(item)
    
    # JavaScript formatında kaydet
    with open('universiteler.js', 'w', encoding='utf-8') as f:
        f.write('const universiteVerileri = ')
        json.dump(json_data, f, ensure_ascii=False, indent=4)
        f.write(';')
        
    print(f"Başarılı! Toplam {len(json_data)} bölüm işlendi ve universiteler.js dosyasına aktarıldı.")

if __name__ == '__main__':
    convert_excel_to_js()
