import mysql.connector

# --- AYARLAR ---
DB_CONFIG = {
    'user': 'root',
    'password': '',
    'host': 'localhost',
    'database': 'GeleceginiSecDB'
}

def simulasyonu_baslat():
    conn = mysql.connector.connect(**DB_CONFIG)
    cursor = conn.cursor()

    print("\n" + "="*40)
    print("🎓 GELECEĞİNİ SEÇ - SİMÜLASYON MODU 🎓")
    print("="*40)

    # 1. Bölümleri Listele
    print("\n📋 Mevcut Bölümler:")
    cursor.execute("SELECT BolumID, BolumAdi, PuanTuru FROM Bolumler")
    bolumler = cursor.fetchall()

    if not bolumler:
        print("❌ Veritabanında hiç bölüm yok! Önce veri yükle.")
        return

    for b in bolumler:
        print(f"[{b[0]}] {b[1]} ({b[2]})")

    # 2. Kullanıcıdan Seçim Al
    print("\n🤔 Hangi iki bölüm arasında kaldın? (ID numaralarını yaz)")
    try:
        secim1 = int(input("1. Bölüm ID: "))
        secim2 = int(input("2. Bölüm ID: "))
    except ValueError:
        print("❌ Lütfen sadece sayı giriniz!")
        return

    # Seçilen bölümlerin isimlerini al
    bolum_adlari = {b[0]: b[1] for b in bolumler}
    puanlar = {secim1: 0, secim2: 0} # Başlangıç puanları

    if secim1 not in bolum_adlari or secim2 not in bolum_adlari:
        print("❌ Hatalı seçim yaptınız.")
        return

    print(f"\n🚀 {bolum_adlari[secim1]} VS {bolum_adlari[secim2]} karşılaşması başlıyor!")
    print("-" * 50)

    # 3. İlgili Soruları Getir
    # Sadece bu iki bölümle ilişkisi olan soruları soracağız.
    query = """
    SELECT DISTINCT S.SoruID, S.SoruMetni 
    FROM Sorular S
    JOIN BolumSoruIliskisi BSI ON S.SoruID = BSI.SoruID
    WHERE BSI.BolumID IN (%s, %s)
    """
    cursor.execute(query, (secim1, secim2))
    sorular = cursor.fetchall()

    if not sorular:
        print("⚠️ Bu bölümler için tanımlanmış soru bulunamadı.")
        return

    # 4. Testi Uygula
    for soru_id, soru_metni in sorular:
        print(f"\n❓ {soru_metni}")
        cevap = input("   Cevabın (E: Evet / H: Hayır): ").lower()

        if cevap == 'e':
            # Bu sorunun, seçilen bölümlere etkisi nedir?
            q_etki = "SELECT BolumID, PuanEtkisi FROM BolumSoruIliskisi WHERE SoruID = %s"
            cursor.execute(q_etki, (soru_id,))
            etkiler = cursor.fetchall()

            for bolum_id, puan_etkisi in etkiler:
                if bolum_id in puanlar:
                    puanlar[bolum_id] += puan_etkisi
                    # Gizli log (Hata ayıklama için)
                    # print(f"   -> {bolum_adlari[bolum_id]} puanı {puan_etkisi} değişti.")

    # 5. Sonuçları Hesapla
    toplam_puan = sum(puanlar.values())
    
    # Negatif puanları düzelt (Ekranda eksi görmemek için)
    if puanlar[secim1] < 0: puanlar[secim1] = 0
    if puanlar[secim2] < 0: puanlar[secim2] = 0
    toplam_puan = puanlar[secim1] + puanlar[secim2]

    print("\n" + "="*40)
    print("📊 ANALİZ SONUCU")
    print("="*40)

    if toplam_puan == 0:
        print("İki bölüm için de nötr kaldın. Biraz daha araştırmalısın.")
    else:
        yuzde1 = (puanlar[secim1] / toplam_puan) * 100
        yuzde2 = (puanlar[secim2] / toplam_puan) * 100

        print(f"🔹 %{yuzde1:.1f} {bolum_adlari[secim1]}")
        print(f"🔸 %{yuzde2:.1f} {bolum_adlari[secim2]}")

        # Kazananı Belirle
        kazanan_id = secim1 if puanlar[secim1] >= puanlar[secim2] else secim2
        print(f"\n🏆 ÖNERİLEN BÖLÜM: {bolum_adlari[kazanan_id].upper()}")

        # 6. Kazanan Bölümün Üniversitelerini Listele
        print(f"\n🏫 {bolum_adlari[kazanan_id]} İçin En İyi Üniversiteler:")
        print("-" * 40)
        
        uni_query = """
        SELECT U.UniversiteAdi, UB.TabanPuan, UB.Kontenjan, U.Sehir
        FROM UniversiteBolumleri UB
        JOIN Universiteler U ON UB.UniversiteID = U.UniversiteID
        WHERE UB.BolumID = %s
        ORDER BY UB.TabanPuan DESC
        LIMIT 5
        """
        cursor.execute(uni_query, (kazanan_id,))
        universiteler = cursor.fetchall()

        print(f"{'Üniversite':<30} | {'Puan':<8} | {'Şehir'}")
        print("-" * 50)
        for u in universiteler:
            print(f"{u[0]:<30} | {u[1]:<8} | {u[3]}")

    conn.close()

if __name__ == "__main__":
    simulasyonu_baslat()