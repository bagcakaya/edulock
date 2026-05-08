import mysql.connector

# --- AYARLAR ---
DB_CONFIG = {
    'user': 'root',
    'password': '',
    'host': 'localhost',
    'database': 'GeleceginiSecDB'
}

# --- SORU SENARYOLARI ---
# Format: "Soru Metni": [("Etkilediği Bölüm", Puan), ("Diğer Bölüm", Puan)]
soru_listesi = {
    "Matematik problemlerini çözmekten keyif alır mısın?": [
        ("Bilgisayar Mühendisliği", 10),
        ("Yazılım Mühendisliği", 10),
        ("Mimarlık", 5),
        ("Tıp", 5)
    ],
    "Uzun saatler bilgisayar başında oturup karmaşık kodları inceleyebilir misin?": [
        ("Bilgisayar Mühendisliği", 15),
        ("Yazılım Mühendisliği", 20),
        ("Mimarlık", -5), # Mimarlar çizim yapar, sadece kod yazmaz
        ("Hukuk", -10)
    ],
    "Çizim yeteneğine güveniyor musun ve tasarım yapmayı sever misin?": [
        ("Mimarlık", 20),
        ("Bilgisayar Mühendisliği", 0), # Etkisiz
        ("Hukuk", -5)
    ],
    "Kalın kitapları okumak, kanun ve maddeleri incelemek ilgini çeker mi?": [
        ("Hukuk", 20),
        ("Yazılım Mühendisliği", -5),
        ("Tıp", 5) # Tıpçıların da çok okuması gerekir
    ],
    "İnsan anatomisi, biyoloji ve hastane ortamı ilgini çeker mi?": [
        ("Tıp", 25),
        ("Mimarlık", -10),
        ("Bilgisayar Mühendisliği", -10)
    ],
    "Haksızlığa uğrayan birini savunmak için saatlerce tartışabilir misin?": [
        ("Hukuk", 15),
        ("Tıp", 5)
    ],
    "Bir yapının nasıl ayakta durduğunu, estetiğini ve statiğini merak eder misin?": [
        ("Mimarlık", 20),
        ("İnşaat Mühendisliği", 15)
    ]
}

def sorulari_yukle():
    print("🧠 Karar Mekanizması (Sorular) yükleniyor...")
    
    try:
        conn = mysql.connector.connect(**DB_CONFIG)
        cursor = conn.cursor()

        for soru_metni, etkiler in soru_listesi.items():
            # 1. Soruyu Ekle
            print(f"❓ Soru ekleniyor: {soru_metni[:30]}...")
            cursor.execute("INSERT INTO Sorular (SoruMetni) VALUES (%s)", (soru_metni,))
            soru_id = cursor.lastrowid

            # 2. Etkilerini Ekle
            for bolum_adi, puan in etkiler:
                # Bölümün ID'sini bul (Veritabanında kayıtlı mı?)
                cursor.execute("SELECT BolumID FROM Bolumler WHERE BolumAdi = %s", (bolum_adi,))
                result = cursor.fetchone()
                
                if result:
                    bolum_id = result[0]
                    
                    # İlişkiyi Kaydet
                    cursor.execute("""
                        INSERT INTO BolumSoruIliskisi (SoruID, BolumID, PuanEtkisi)
                        VALUES (%s, %s, %s)
                    """, (soru_id, bolum_id, puan))
                else:
                    print(f"   ⚠️ Uyarı: '{bolum_adi}' veritabanında bulunamadı, bu etki atlandı.")

        conn.commit()
        print("🎉 HARİKA! Tüm sorular ve mantık sistemi veritabanına işlendi.")

    except mysql.connector.Error as err:
        print(f"❌ HATA: {err}")
    finally:
        if 'conn' in locals() and conn.is_connected():
            cursor.close()
            conn.close()

if __name__ == "__main__":
    sorulari_yukle()