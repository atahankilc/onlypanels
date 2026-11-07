# Planner ekranı: plan

Yazıldı: 7 Kasım 2026, 23:00. Teslim: 8 Kasım 15:00, özellik dondurma 12:00.
Kanıt türleri: **[Veri]** kendi verimiz (dev bölümü, yalnızca toplamlar, `scripts/profile_alternatives.py` ve `docs/data/findings.md`), **[Kaynak]** dış kaynak (bağlantılar sonda), **[Yorum]** bizim yargımız.

## 0. Tek paragrafta

Planner bir isteği açtığında AI işi çoktan yapmış olmalı: ev bilgilerini kaynağıyla toplamış, çatıyı ölçmüş, bir tasarım önermiş, iki alternatif hazırlamış, kendi önerisini benzer evlerdeki uzman kararlarıyla karşılaştırmış ve "teklif öncesi bakılması gerekenler" listesini çıkarmış. Planner'ın işi bunu **kontrol etmek**: sıfırdan tasarlamaktan ucuz olmalı. Bunun için ekran üç şey gösterir: **ne önerildi**, **neden** (motorun adım adım karar izi, dil modelinin "düşünceleri" değil) ve **ne kadar güvenilir** (benzer evlerde uzmanların aralığı). Planner her şeyi değiştirebilir, motor geri kalanı uyarlar ve neyin neden değiştiğini bir "fark kartı"nda söyler. Sonunda tek sayfalık bir teklif çıkar. **Birden fazla AI ajanı kurmuyoruz**: sabit sıralı bir hat var, sayıları eğitilmiş modeller ve fizik üretir, dil modeli yalnızca iki yerde çalışır (cümleyi değişikliğe çevirmek, açıklamayı yazmak) ve kapatılınca ekran yine tam çalışır.

## 1. Bugün elimizde olan

Planner masası çalışıyor (`web/src/Planner.tsx`): istek listesi, 3D evde yerleştirilmiş paneller, Design / Roof / Facts / Energy / Checks sekmeleri, kilitlenebilir PV, batarya, wallbox ve ısı pompası, cümleyle değişiklik, "Why" listesi, kaynak etiketli bilgiler. Motor (`engine/src/reonic_engine/design.py`) tek bir tasarım, gerekçe kodları ve benzer ev özeti döndürüyor.

Eksik olanlar:

| Eksik | Neden önemli |
|---|---|
| Karar izi yok, yalnızca gerekçe cümleleri var | Brief: planner "neden"i anlamalı. Planner'ın en büyük korkusu kara kutu |
| Değişiklikten sonra neyin neden değiştiği görünmüyor | Brief'in 2. yapı taşı: "geri kalan uzmanın beklediği gibi uyarlanır ve planner nedenini anlar" |
| Alternatif yok | Brief stretch hedefi. Uzmanlar da birden fazla seçenek veriyor |
| Uzmanla karşılaştırma ve genel sonuçlar hiçbir ekranda yok (D38'den beri) | Demo'nun 4. adımı ve "teknik derinlik" kriteri bunu istiyor |
| Son çıktı yok: "Send offer" yalnızca durumu değiştiriyor | Kullanıcının istediği "cart curt son çıktı" |
| Kontroller düz bir liste: neyin teklifi durdurduğu, neyin not olduğu ayrılmıyor | Planner zamanını doğru yere harcamalı |

## 2. Üç araştırma kolundan ne öğrendik

### 2a. Kendi verimiz: uzmanlar nasıl karar veriyor [Veri]

- **PV'yi tüketimin iki katı kadar kuruyorlar.** Ortanca evde panellerin yıllık üretimi yıllık tüketimin 1,9 katı (evlerin %80'i 1,0 ile 3,4 katı arasında, Almanya için 950 kWh/kWp varsayımıyla). Yani uzman "tüketimi karşıla" diye değil, "çatıya sığdığı kadar, makul bir üst sınırla" diye kuruyor. Çatı verimizde yoktu, artık ölçüyoruz.
- **Batarya kWp başına yaklaşık 1 kWh.** Bataryalı evlerde ortanca 0,97 kWh/kWp, iki kurulumcuda da aynı. Bağımsız rehber (HTW) bunun genelde büyük olduğunu söylüyor, kWp başına ve 1.000 kWh tüketim başına en fazla 1,5 kWh öneriyor [Kaynak 1, 2].
- **Batarya neredeyse her zaman var.** A kurulumcusunda tüketim bandına göre %91 ile %97, B'de %70 ile %96.
- **Kurulumcuların sabit "katalog boyları" var.** A: 10 kWh (%41), 5 (%21), 7 (%17), 15 (%10). B: 9 kWh (%46), 18, 6. Öneri bu boylara oturmalı.
- **Uzmanlar aynı eve birden fazla seçenek verdiğinde neyi değiştiriyor?** 1.041 projenin 193'ünde birden fazla seçenek var. Bunların %27'sinde yalnızca batarya, %19'unda yalnızca PV, %18'inde ikisi birden değişiyor; %35'inde boylar aynı, muhtemelen ürün veya marka farklı. **Alternatiflerimiz bu kalıbı izlemeli: önce batarya varyantı, sonra PV varyantı.**
- **Girdiler zayıf.** Motor sabit bir tasarımdan biraz iyi, ama aynı ev için uzmanların kendi seçenekleri de neredeyse bu kadar farklı. Bu yüzden tek sayı değil, sayı **ve aralık** göstermeliyiz.

### 2b. Sektör: diğer araçlar ne yapıyor [Kaynak]

- **Akış her yerde aynı:** çatı modeli, otomatik yerleşim, üretim hesabı, ekonomi, 1 ile 3 varyant, web teklifi ve imza (Reonic, Aurora, OpenSolar, SolarEdge) [3, 4, 5].
- **Aurora:** AI tasarımı, tasarımcı projeyi açtığında hazır bekliyor; tasarımcı "editör" oluyor [6]. Bizim D30 ile aynı fikir.
- **Hiçbir araç tasarım başına güven veya karar izi göstermiyor.** Onlar "güven" deyince yalnızca doğrulanmış simülasyonu kastediyor [3, 4]. **Bizim farkımız bu olabilir.**
- **Alternatifler:** genelde 2 ile 3 varyant. Daha fazlası kararsızlık yaratıyor [5]. Üç seçeneğin satışı artırdığına dair güneş sektöründe sağlam bir çalışma yok; ortadaki seçeneğin çekiciliği laboratuvar deneylerinden biliniyor [7]. Bu yüzden satış artışı iddia etmeyeceğiz.
- **Alman teklifinde olması gerekenler:** ürünler marka ve modeliyle, iskele, kablo, sayaç panosu (yenilenirse 1.500 ile 4.000 €), şebeke kaydı, üretim tahmini, öz tüketim ve bağımsızlık oranı, varsayımlar [8, 9]. PV ve bataryada %0 KDV.
- **Ne söylenmemeli:** "autark", %100 bağımsızlık. Mahkemeler bu tür reklamları durdurdu [10]. HTW, aynı ev için hesaplayıcıların %76 ile %99 arası bağımsızlık verdiğini, ölçülenin %77 olduğunu buldu ve varsayımların açıkça yazılmasını istiyor [11]. **Bağımsızlık ve tasarruf, varsayımlarıyla birlikte "tahmin" diye gösterilmeli.**
- **2025 sonrası kurallar:** akıllı sayaç yoksa yeni sistemlerin şebekeye verebileceği güç kWp'nin %60'ıyla sınırlı (Solarspitzengesetz); 10 kWp altı besleme bedeli 7,70 ct, 2027 sonrası belirsiz; ısı pompası ve wallbox §14a kapsamında [12, 13]. Bunlar motor değil, kontrol listesi ve teklif notu olur.
- **Isı pompası:** yakıt faturasından kaba boy çıkar, ama son boy için oda oda ısı yükü hesabı gerekir [14]. Yani ısı pompası önerisi her zaman "ön boy, saha kontrolü gerekir" etiketi taşır.

### 2c. AI mimarisi ve öneri gösterimi [Kaynak]

- **Çok ajanlı sistem burada yanlış araç.** Anthropic'in kendi rehberi: en basit çözümü bul, karmaşıklığı ancak gerekince ekle. Çok ajanlı sistemler sohbetin yaklaşık 15 katı token harcıyor ve en çok geniş, paralel arama işlerinde fayda sağlıyor. Adımların aynı bilgiyi paylaştığı ve sıkı sırayla bağlı olduğu işler için uygun değiller [15, 16]. Bir NeurIPS çalışması çok ajanlı sistemlerin hatalarının çoğunun sistem tasarımından geldiğini buldu [17]. Bizim işimiz tam olarak "aynı ev, sıralı adımlar, sayılar zaten motordan".
- **Dil modelinin "düşünce zinciri" güvenilir bir iz değil.** Modeller cevabı gerçekten etkileyen şeyi çoğu zaman yazmıyor; Anthropic'in ölçümünde bu oran %25 civarında kaldı [18, 19]. Bu yüzden ekranda **motorun gerçek adımları** gösterilmeli: girdi, kural veya model, çıktı, kaynak. Bunlar tanım gereği doğru.
- **Süslü açıklama körü körüne kabulü artırıyor.** Uzman kullanıcılarda açıklamalar, AI haklı da olsa haksız da olsa kabulü artırdı [20]. Açıklama ancak **AI'ı kontrol etmeyi işi yeniden yapmaktan ucuz hale getirirse** işe yarıyor [21]. İşe yarayanlar: sayısal aralık (güveni pek düşürmüyor) [22], benzer geçmiş vakalar [23], "neden bu da şu değil" karşılaştırması [24].
- **Dil modeline sayı yazdırmadan açıklama:** model yalnızca yer tutucularla yazar (`{pv_kwp}`), sayıları kod doldurur, metindeki her rakam motor çıktısıyla karşılaştırılır, uymazsa bir kez yeniden denenir, olmazsa hazır şablon kullanılır [25, 26].
- **"AI taslak yazar, insan onaylar" kalıbının en iyi örneği kod editörleri:** öneri yerinde görünür, parça parça kabul veya geri alınır, geri alma her zaman var [27]. Hangi alanı kimin değiştirdiğini gösteren bir teklif aracı bulunamadı; bu da bir fark olabilir.

## 3. AI nasıl çalışmalı

### 3a. Karar: ajanlar değil, sabit bir hat

Kavramsal olarak bir uzman planner'ın kafasındaki altı rol var. Bunları ayrı AI ajanları olarak değil, sırayla çalışan kod adımları olarak kuruyoruz. Ekranda yine altı adım olarak görünürler, çünkü planner'ın takip etmesi gereken şey tam olarak bu.

```text
İstek gelir (ev sahibi veya telefon)
  │
  1. Bilgi toplama      kod      cevapları normalleştir, kaynağı işaretle (müşteri, ölçüldü, varsayıldı, sen),
  │                              eksikleri yerine geçen değerle doldur ve listele
  2. Çatı               kod      ölçülmüş yüzeyler, sığan modül, gölge sonrası verim  (var)
  │
  3. Boyutlandırma      model    geçmiş 1.041 uzman tasarımından öğrenen modeller: PV, batarya var mı, batarya boyu
  │                              + aralık (benzer evlerde uzmanlar ne seçti) + çatı sınırı + katalog boyuna oturtma
  4. Seçenekler         kod+fizik önerilen tasarım + en fazla iki alternatif, her biri saatlik enerji tahminiyle
  │
  5. Denetçi            kod      kurallar ve benzer evler: "bu batarya benzer evlerin %90'ından büyük",
  │                              rehber sınırı, varsayılan bilgi, teklifi durduran saha konuları
  6. Yazar              LLM*     karar izinden 3 cümlelik özet ve ev sahibi için sade açıklama
  │                              *yer tutucuyla, sayılar kontrol edilir, olmazsa şablon
  ▼
Taslak hazır (planner açmadan önce, D30)

Planner değişiklik yapar ─► düğme veya cümle ─► [Yorumlayıcı LLM*: cümle → tipli değişiklik, kural yedeği var]
                         ─► 3, 4, 5, 6 kilitli değerlerle yeniden ─► fark kartı
Planner onaylar ─► Teklif sayfası
```

**Neden böyle:**
1. Sayılar zaten motordan geliyor (proje kuralı). Ajanların karar verebileceği bir sayı yok; geriye yalnızca gecikme, maliyet ve tutarsızlık kalır.
2. Her adım test edilebilir ve her seferinde aynı sonucu verir. Demo internet olmadan da çalışır.
3. Brief "AI gerçek bir parça olmalı" diyor ve veriden öğrenen modelleri açıkça sayıyor. Bizim AI'ımız 3. adımdaki eğitilmiş modeller ve 5. adımdaki benzer ev karşılaştırması. Dil modeli arayüz, karar verici değil. Bunu sunumda açıkça söylemek güçlü bir mesaj: "dil modeli tek başına uzmanı taklit edemez, biz ölçtük".
4. Denetçi bilerek dil modeli değil: kurallarımız yazılabilir, dil modeli sayı denetiminde güvenilmez.

### 3b. Dil modelinin iki işi

| İş | Girdi | Çıktı | Güvenlik | Kapalıyken |
|---|---|---|---|---|
| Yorumlayıcı (var: `refine.py`) | Planner'ın cümlesi, yalnızca cümle | Tipli değişiklik listesi | Ekranda "şunu anladım" gösterilir, planner onaylar. Sayı yalnızca cümlede yazıyorsa alınır | Kurallar |
| Yazar (yeni) | Karar izi JSON'u (Reonic verisi değil, demo evinin motor çıktısı) | 3 cümlelik planner özeti, ev sahibi metni | Yer tutucu, rakam denetimi, bir yeniden deneme, şablon yedeği. Yasak kelimeler: autark, garantiert, unabhängig. "Metni AI yazdı, sayılar motordan" etiketi | Şablonlar (önce bunları yazıyoruz) |

Yazar taslak oluşurken arka planda çalışır, planner beklemez. Geçmiş Reonic projeleri **hiçbir zaman** dil modeline gitmez (Q2 cevaplanmadı).

## 4. Akış: planner'ın yolculuğu

| # | Adım | Planner ne yapar | Ekran ne gösterir |
|---|---|---|---|
| 1 | İstekler | Hangisine bakacağını seçer | Her istekte: ev, kaynak, AI taslağı tek satırda, güven, "teklifi durduran" sayısı, durum. Sıralama: hazır olanlar önce |
| 2 | Açılış özeti | İlk 10 saniyede durumu anlar | Üstte bir kart: öneri tek satır, neden 3 madde, kaç bilgi varsayıldı, ne teklifi durduruyor. Sağda 3D ev ve paneller |
| 3 | Ev | Varsayılan bilgileri düzeltir veya onaylar | Bilgiler kaynak etiketiyle; çatı yüzeyleri, sığan modül, verim. Varsayılanlar sarı |
| 4 | Tasarım | Öneriyi inceler, değiştirir, alternatif seçer | Bileşen kartları (değer, aralık, benzer evler, "neden bu da şu değil"), alternatifler yan yana, karar izi, fark kartı |
| 5 | Kontroller | Teklifi durduranları kapatır | Üç grup: teklifi durdurur, teklif notu, bilgi |
| 6 | Teklif | Son halini görür, ev sahibinin neyi değiştirebileceğini seçer, gönderir | Tek sayfalık teklif, yazdırılabilir |

Ayrıca istek listesinin yanında ikinci bir sayfa: **Kanıt**. Geçmiş projelerde AI'ın önerisi ile uzmanın teslim ettiği tasarım yan yana, ve tüm projelerde kurulumcu bazında sonuçlar. Demo'nun 4. adımı burası.

Hafif bir "önce bilgiler" adımı: araştırma, planner AI cevabını görmeden önce birkaç temel bilgiyi onaylarsa körü körüne kabulün azaldığını gösteriyor [28], ama bunu kullanıcılar sevmiyor. Orta yol: tasarım hemen görünür, ama **varsayılan bilgiler onaylanmadan "Teklifi gönder" açılmaz**. Böylece taslak hızlı gelir, ama yanlış bir varsayımla teklif çıkmaz.

## 5. Ekran

Çizimdeki sayılar örnektir. Mevcut düzen kalıyor (D37, D53): sağda 3D ev, solda cam panel. Sekmeler, planner'ın karar sırasına göre dörde iniyor: **Ev, Tasarım, Kontroller, Teklif**. Energy, Tasarım'ın içine giriyor. Facts ve Roof, Ev'de birleşiyor.

```text
┌───────────────────────────────────────────────┬──────────────────────────────┐
│ ← Hauptstr. 12, Garching · ev sahibi isteği   │                              │
│                              [Teklifi gönder] │                              │
│ ┌───────────────────────────────────────────┐ │                              │
│ │ AI önerisi   9,9 kWp · 10 kWh · wallbox    │ │        3D ev, paneller       │
│ │ • Çatı 30 modül alıyor, 22'si kullanıldı   │ │        (seçenek değişince    │
│ │ • Benzer 148 evde uzmanlar 7–12 kWp seçti  │ │         paneller değişir)    │
│ │ • 2 bilgi varsayıldı · 1 konu teklifi      │ │                              │
│ │   durduruyor                               │ │                              │
│ └───────────────────────────────────────────┘ │                              │
│ [ Ev | Tasarım | Kontroller 3 | Teklif ]      │                              │
│                                               │                              │
│ Seçenekler                                    │                              │
│ ┌ Önerilen ──┐ ┌ Küçük batarya ┐ ┌ Çatı dolu ┐ │                              │
│ │ 22 modül   │ │ 22 modül      │ │ 30 modül  │ │                              │
│ │ 10 kWh     │ │ 7 kWh         │ │ 10 kWh    │ │                              │
│ │ ~%68 kendi │ │ ~%63 kendi    │ │ ~%72      │ │                              │
│ └────────────┘ └───────────────┘ └───────────┘ │                              │
│                                               │                              │
│ Güneş   22 modül, 9,9 kWp        [── ● ──][Oto]│                              │
│         benzer evler ├──[■■■■●■■]──┤ 7–12 kWp │                              │
│         Neden 9,9 ve 13,5 değil: tüketimin 2  │                              │
│         katı üretiyor, uzmanların ortancası   │                              │
│ Batarya 10 kWh                   [10 kWh ▾]   │                              │
│         ...                                   │                              │
│ ▸ Karar izi (6 adım)                          │                              │
│ [ Ne değişti? örn. gelecek yıl elektrikli araç alıyorlar ] [Uygula]          │
└───────────────────────────────────────────────┴──────────────────────────────┘
```

Her bileşen kartı dört şey taşır: değer, benzer evlerdeki uzman aralığı üzerinde nerede durduğu (küçük bir çizgi), tek cümlelik "neden bu da şu değil", ve kimin belirlediği (AI, sen, cümle). Kilitli değerin yanında kilit işareti.

## 6. Düşünce zinciri: karar izi

Motor, tasarımla birlikte bir `trace` döndürür. Her adımda: girdiler (kaynak etiketiyle), kullanılan kural veya model, çıktı, ve bu adımın türü (ölçüldü, öğrenildi, kural, fizik, varsayım). Örnek:

| # | Adım | Girdi | Nasıl | Sonuç |
|---|---|---|---|---|
| 1 | Yıllık ihtiyaç | Ev 4.200 kWh (müşteri) · araç 11.300 km (varsayıldı) | 0,18 kWh/km | 4,2 + 2,0 = 6,2 MWh |
| 2 | Çatı | 3 yüzey (ölçüldü) | Modül 1,13 × 1,76 m, kenardan 40 cm | 30 modül sığar, en iyi yüzey 1.020 kWh/kWp |
| 3 | PV boyu | 6,2 MWh, kurulumcu A | Geçmiş uzman tasarımlarından öğrenen model | 9,9 kWp. Benzer 148 evde uzmanların %80'i 7–12 kWp. Çatı sınırı yok |
| 4 | Batarya | 9,9 kWp | Öğrenen model, A'nın katalog boylarına oturtuldu | 10 kWh, %94 olasılık. Rehber sınırı 9,3 kWh: biraz üstünde (not) |
| 5 | Isı pompası | Gaz, müşteri "emin değilim" | Kural, az örnek | Tasarıma girmedi, alternatif olarak hazır |
| 6 | Kontrol | Tasarım | Saatlik tahmin, varsayılan profillerle | Kendi kullanım ~%68, tasarruf ~1.200 €/yıl, tahmin |

İz katlanmış başlar ("Karar izi, 6 adım"), açılınca bir zaman çizelgesi olur. Bir adıma tıklayınca ilgili şey vurgulanır: 2. adımda 3D'de yüzeyler, 3. adımda aralık çizgisi. Planner bir girdiyi değiştirince yalnızca etkilenen adımlar yanıp söner.

Sayılar yukarıda örnek, gerçek ev için motor üretir.

## 7. Alternatifler

En fazla üç kart: **Önerilen** her zaman ilk ve ölçtüğümüz tasarım budur. Diğer ikisi, uzmanların kendi seçeneklerini değiştirme biçimine göre şu sırayla seçilir [Veri, bölüm 2a]:

1. **Batarya varyantı.** Önerilen batarya rehber sınırını aşıyorsa bir katalog boyu küçük ("rehbere uygun"), aşmıyorsa bir boy büyük ("daha çok kendi elektriği"). Batarya kararı belirsizse (%80 altı) "bataryasız".
2. **PV varyantı.** Çatıya belirgin şekilde daha fazla sığıyorsa "çatıyı doldur". Çatı sınırladıysa bu kart çıkmaz.
3. **Isı pompalı.** Gaz veya petrol varsa ve ısı pompası tasarımda değilse, ilk iki karttan birinin yerine geçer.

Her kart aynı motorla, kilitli değerlerle hesaplanır, kendi kendi kullanım ve tasarruf tahmini vardır. Bir karta tıklamak onu tasarım yapar (kilitler) ve fark kartı gösterir. Kart başlıkları neyin farklı olduğunu söyler, "iyi, daha iyi, en iyi" gibi satış etiketleri kullanmayız.

## 8. Değişiklik ve fark kartı

Her değişiklikten sonra (düğme, kaydırıcı, cümle, alternatif seçimi) panelin üstünde kısa bir kart:

```text
Elektrikli araç eklendi  (cümleden, "gelecek yıl araba alıyorlar")
  İhtiyaç       6,2 → 8,2 MWh
  Güneş         22 → 26 modül   çatıda yer var
  Batarya       10 kWh, aynı    katalogda sonraki boy 15, gerek görülmedi
  Wallbox       eklendi
  [Geri al]
```

Fark, önceki ve yeni tasarım karşılaştırılarak arayüzde çıkarılır; motorda yeni iş gerekmez. Değişiklik geçmişi tutulur, her adım geri alınabilir. İlk AI taslağı her zaman saklı kalır ve teklifte "AI taslağından farklar" olarak görünür.

**Doğrulama (brief'in 2. kullanım durumu):** planner bir değeri elle değiştirirse denetçi onu benzer evlerle karşılaştırır: "15 kWh, A kurulumcusunda benzer evlerin %90'ından büyük; genelde 7–10 kWh". Yasaklamaz, yalnızca söyler.

## 9. Son çıktı: teklif sayfası

Tek sayfa, yazdırılabilir (tarayıcıdan PDF):

1. Ev: adres, 3D görüntü ve paneller
2. Sistem: bileşenler, boylar, kurulumcunun en çok sattığı ürün adıyla (fiyat yok, verimizde yok)
3. Üretim ve tahminler: yıllık üretim, kendi kullanım, bağımsızlık, tasarruf, hepsi "tahmin, varsayımlar şunlar" notuyla. "Autark" yok
4. Varsayımlar: hangi bilgi müşteriden, hangisi ölçüldü, hangisi varsayıldı
5. Teklif öncesi açık kontroller: sayaç panosu, şebeke, çatı durumu, ısı yükü, %60 besleme sınırı
6. Ev sahibinin değiştirebilecekleri: planner işaretler (bataryayı kaldır, bir boy büyüt, wallbox). Brief'in gerilimi tam olarak bu: ev sahibi yalnızca kurulumcunun izin verdiği şeyleri değiştirir
7. AI taslağından farklar ve planner'ın adı: kimin neye karar verdiği açık

Teklif bir veri nesnesi olarak saklanır. Ev sahibinin teklifi görüp seçenek denediği ekran sonraki adım (D62: onaylanmadan ev sahibine hiçbir şey gitmez); bu nesne onun girdisi olur.

## 10. Kanıt sayfası

Demo'nun 4. adımı ve "teknik derinlik" kriteri için:

- **Tek proje:** geçmiş bir proje açılır, solda motorun önerisi, sağda uzmanın teslim ettiği tasarım (birden fazla seçenek varsa hepsi). Geçmiş projelerde adres ve çatı yok, bu açıkça yazılır. Projeler, motorun o projeyi görmeden eğitildiği tahminlerden gelir (dev bölümünde çapraz tahmin). Test bölümü yalnızca son sayılar için.
- **Tüm projeler:** kurulumcu bazında, basit yöntemlere karşı (hep ortanca, kaba kural) ve gürültü tabanına karşı ("uzmanın kendi seçenekleri ne kadar farklı"). Sayılar `scripts/evaluate.py` çıktısından.
- Ekranda proje kimliği yok. Veri yerelde kalır, git'e girmez.

## 11. Motor ve API'de gereken işler

| İş | Nerede | Puanları değiştirir mi |
|---|---|---|
| `trace` döndür: adımlar, girdiler, kaynak, tür | `design.py` | Hayır |
| `options`: önerilen + en fazla 2 alternatif, aynı motorla kilitli değerlerle | `design.py` | Hayır, önerilen aynı kalır |
| Benzer evlerde batarya dağılımı ve "bu değer yüzde kaçıncı" | `Engine.similar` | Hayır |
| Rehber sınırı notu (kWp ve tüketim başına 1,5 kWh) | `design.py` | Hayır, yalnızca not |
| Kontrollere önem derecesi: durdurur, not, bilgi | arayüz veya motor | Hayır |
| Isı pompası yalnızca müşteri veya planner isterse; yoksa alternatif kartı | `design.py` | Isı pompası satırları değişebilir, ölçülmeli |
| Geçmiş proje karşılaştırması: çapraz tahminleri yerelde hazırla, `GET /api/proof` | betik + API | Hayır |
| Yazar: şablonlar, sonra dil modeli + rakam denetimi | yeni `explain.py` | Hayır |

Rapordaki bekleyen motor düzeltmeleri (fiyatı boyut hesabından çıkarmak gibi) puanları değiştirir; ayrı bir karar.

## 12. Bilerek yapmayacaklarımız

- Birden fazla AI ajanı, ajan çerçevesi
- Dil modelinin ham düşüncelerini göstermek
- Dil modeline sayı ürettirmek veya denetçi yaptırmak
- Tek bir "güven yüzdesi" rozeti: aralık ve benzer evler daha dürüst
- Fiyat, geri ödeme süresi: verimizde fiyat yok
- Satış artışı iddiası: verimizde yalnızca kazanılmış işler var
- Teklifte "autark", "garantili", %100 bağımsızlık

## 13. Zaman planı

Şimdi 23:00. Öncelik sırası, brief'in istediğine göre:

| Öncelik | İş | Süre | Neden bu sırada |
|---|---|---|---|
| P0 | Karar izi + fark kartı + doğrulama notları | ~2,5 saat | Brief'in 2. yapı taşı, planner'ın "neden"i |
| P0 | Kanıt sayfası | ~2 saat | Brief'in minimumu ve demo'nun 4. adımı. Şu an hiçbir ekranda yok |
| P1 | Teklif sayfası + "varsayılanlar onaylanmadan gönderilmez" | ~1,5 saat | Son çıktı |
| P1 | Alternatifler | ~1,5 saat | Stretch, ama demo'da çok görünür |
| P1 | Sekmeleri dörde indirmek, açılış özeti kartı | ~1 saat | Akış |
| P2 | Yazar için dil modeli (şablonlar P0 içinde) | ~1 saat | Hoş ama gerekli değil |

Toplam ~9,5 saat. Önerilen sıra: bu gece P0'ın ilki ve motor tarafı, sabah 08:00'den itibaren Kanıt, Teklif, Alternatifler. 12:00'de dondurma. Geride kalırsak önce dil modeli, sonra alternatifler düşer. Karar izi ve Kanıt düşmez.

## 14. Senin kararın gereken sorular

1. Kanıt sayfası planner ekranında ayrı bir sayfa olsun mu? (Öneri: evet)
2. Isı pompası yalnızca müşteri veya planner isterse tasarıma girsin, yoksa alternatif kartı olsun mu? (Öneri: evet)
3. "Varsayılan bilgiler onaylanmadan Teklifi gönder kapalı" kuralı olsun mu? (Öneri: evet)
4. Yazar dil modeli demo'da açık mı olsun, yoksa yalnızca şablon mu? (Öneri: şablon önce, zaman kalırsa dil modeli)
5. Sekmeler Ev, Tasarım, Kontroller, Teklif olarak dörde insin mi? (Öneri: evet)

## Kaynaklar

1. HTW Berlin 2022, batarya önerileri: https://solar.htw-berlin.de/wp-content/uploads/ORTH-2022-Empfehlungen-zur-Auslegung-von-Solarstromspeichern.pdf
2. Finanztip, HTW kuralı özeti: https://www.finanztip.de/daily/stromspeicher-zur-pv-anlage-so-gross-darf-er-hoechstens-sein/
3. Reonic güneş ürünü (üretici): https://reonic.com/en-gb/industry/solar/
4. Aurora Sales Mode (üretici dokümanı): https://help.aurorasolar.com/hc/en-us/articles/4406006770067-Sales-Mode-Overview
5. OpenSolar çoklu sistem (üretici dokümanı): https://support.opensolar.com/hc/en-us/articles/12343205311375-How-to-download-select-systems-in-the-PDF-proposal ; SurgePV varyant önerisi (üretici): https://www.surgepv.com/glossary/design-variant-comparison
6. Aurora AI (üretici): https://aurorasolar.com/solar-design-ai-cut-soft-costs-without-replacing-designers/
7. Simonson 1989, uzlaşma etkisi: https://cognition.aau.at/bg/BA/Simonson%20%281989%29.pdf
8. Schenefeld belediyesi PV el notu: https://www.stadt-schenefeld.de/schenefeld/ist-umweltfreundlich/klimaschutzaktionen/photovoltaik-der-weg-zur-eigenen-anlage/handout-praxistipps.pdf?cid=nwd
9. Sayaç panosu maliyeti: https://www.photovoltaik.info/zaehlerschrank-fuer-photovoltaik-wann-ein-umbau-wirklich-noetig-ist-und-was-er-kostet/
10. Viessmann Vishare kararı: https://www.pv-magazine.de/2023/10/19/viessmann-wird-irrefuehrende-werbung-fuer-prosumer-tarif-vishare-final-gerichtlich-untersagt/
11. HTW 2025, güvenilir hesaplayıcılar: https://www.pv-magazine.de/2025/04/30/htw-berlin-augen-auf-bei-photovoltaik-rechnern-im-internet/
12. Solarspitzengesetz: https://www.co2online.de/modernisieren-und-bauen/photovoltaik/solarspitzengesetz/
13. Bundesnetzagentur besleme bedeli: https://www.bundesnetzagentur.de/DE/Fachthemen/ElektrizitaetundGas/ErneuerbareEnergien/EEG_Foerderung/start.html
14. Worms ısı pompası boyutlandırma rehberi: https://www.worms.de/neu-de-wAssets/docs/zukunft-gestalten/klima-umwelt/Energie/BuergerSolarBeratung/_BNS_Waermepumpe-Praxistipps-zur-Auslegung.pdf
15. Anthropic, Building effective agents: https://www.anthropic.com/engineering/building-effective-agents
16. Anthropic, çok ajanlı araştırma sistemi: https://www.anthropic.com/engineering/multi-agent-research-system
17. Cemri vd. 2025: https://arxiv.org/abs/2503.13657
18. Anthropic 2025, akıl yürütme modelleri düşündüklerini her zaman söylemez: https://www.anthropic.com/research/reasoning-models-dont-say-think
19. Turpin vd. 2023: https://arxiv.org/abs/2305.04388
20. Bansal vd. 2021: https://arxiv.org/abs/2006.14779
21. Vasconcelos vd. 2023: https://arxiv.org/abs/2212.06823
22. van der Bles vd. 2020: https://www.pnas.org/doi/10.1073/pnas.1913678117
23. Cai vd. 2019: https://arxiv.org/abs/1902.02960
24. Miller 2019: https://arxiv.org/abs/1706.07269
25. Proof-Carrying Numbers (ön baskı): https://arxiv.org/abs/2509.06902
26. Sayısal halüsinasyon, finans özetleri: https://arxiv.org/abs/2404.06162
27. Copilot Edits: https://code.visualstudio.com/blogs/2024/11/12/introducing-copilot-edits
28. Buçinca vd. 2021: https://arxiv.org/abs/2102.09692
