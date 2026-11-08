# Ev sahibinden aldığımız bilgi: yeterli mi, ne eklenir, nereden çıkarılır

8 Kasım 2026. Önceki rapor `reports/Ev sahibi verileri ve AI kullanımı.md` üzerine kurulu; onun önerilerinin çoğu artık uygulamada (bantlar, kişi sayısı, araç için üç seçenek, ısı pompası sorusu, fiyatın boyuttan çıkması, 11.300 km). Bu rapor bugünkü 10 sayfalık akışı değerlendiriyor. Kendi verimizden gelen sayılar toplu sayımdır, kaynağı `scripts/profile_homeowner_signals.py`.

## Kısa sonuç

- **Akış büyük ölçüde yerinde.** Tasarımı en çok oynatan dört bilgi soruluyor: yıllık elektrik, ısıtma, araç, çatı. Her birinin "bilmiyorum" yolu var ve boş bırakılan cevap planlamacıya "varsayıldı" diye gidiyor. Bu, brief'teki "eksik bilgiyle ne yapılır" sorusuna iyi bir cevap.
- **İki somut boşluk var:** ısıtma listesinde **merkezi ısıtma (Fernwärme)** ve **elektrikli ısıtma** yok, oysa nüfus sayımı ipucu tam bunları önerebiliyor. Mevcut güneş sorusu da **sıcak su kolektörü** ile elektrik panelini ayırmıyor.
- **Daha fazla sayfa eklemeyelim.** 10 sayfa zaten sınırda. Yeni bilgiler var olan sayfalara tek dokunuşluk alt soru olarak girmeli (D75 düzeni).
- **Asıl kazanç sormadan çıkarılabilecek bilgide.** Adresten ağaç gölgesi, anıt koruma, merkezi ısıtma bölgesi ve şebeke işletmecisi çıkarılabilir. Bunlar ev sahibini hiç yormuyor, planlamacının işini ise doğrudan kısaltıyor.

## 1. Bugünkü sorular tek tek

| Sayfa | Durum | Neden |
|---|---|---|
| 1 Çatı (işaretleme) | Yerinde | İsteğe bağlı, "dokunmasan da olur" diyor. Ölçülmüş çatı en büyük eksik veriyi kapatıyor |
| 2 Mevcut güneş | **Eksik** | "Panel" deyince ev sahibi sıcak su kolektörünü de işaretleyebilir. Bavyera'da yaygınlar. Onlar da çatı alanını kapatıyor ama elektrik üretmiyor; motor ise onları eski PV sayıp ihtiyacı küçültür |
| 3 Batarya | Yerinde | Tek dokunuş, boyutu isteğe bağlı |
| 4 Elektrik | Çok iyi | Tam sayı, bant, kendi aralığı, aylık ödeme, kişi sayısı. Fiyat yalnızca tasarrufu etkiliyor |
| 5 Büyük tüketiciler | Yerinde | Yalnızca fatura yoksa ekleniyor, yani çift sayım yok |
| 6 Ev (yıl, alan, sertifika) | Yerinde, bir zayıf alanla | Alan 3D modelden önceden dolu, yıl için "burada yaygın" ipucu var. Enerji sertifikasındaki kWh/m² değerini neredeyse kimse bilmez; zararı yok ama fazla bir şey de kazandırmıyor |
| 7 Isıtma | **Eksik** | Seçenekler: ısı pompası, gaz, petrol, odun, "başka". **Merkezi ısıtma ve elektrikli ısıtma yok.** Münih'te merkezi ısıtma yaygın; ısı planı ısı ihtiyacının üçte ikisinin merkezi ısıtmayla karşılanmasını hedefliyor. Nüfus sayımı ipucu "çevredeki evlerin çoğu merkezi ısıtma kullanıyor" diyebiliyor, ama kişi bunu seçemiyor ve "başka"ya düşüyor. Elektrikli ısıtma ise güneş + batarya + ısı pompası için en güçlü durumlardan biri |
| 8 Araç | İyi, biraz kalabalık | Var / yakında / yok, sonra kaç araç, aylık kWh, km. Hepsi isteğe bağlı |
| 9 Şarj | İyi | Evde mi, gündüz evde mi, wallbox var mı. Bu cevaplar sayıları gerçekten oynatıyor |
| 10 Öncelik | Yerinde | Bütçe veride yok; bu soru onun yerini tutuyor |

Fazla ya da saçma bir soru yok. Önceden sorup sonra çıkardığımız iki soru (ağaçlar, çatı yenileme) zaten kaldırıldı ve bu doğru bir karardı.

## 2. Ev sahibini yormadan eklenebilecekler

Hepsi var olan bir sayfada tek dokunuş. Sıra, faydaya göre.

| Ne | Hangi sayfaya | Neye yarar | Dayanak |
|---|---|---|---|
| **Merkezi ısıtma ve elektrikli ısıtma** seçenekleri | Isıtma | Doğru seçeneği seçebilmek. Merkezi ısıtmada ısı pompası önerilmez. Elektrikli ısıtmada ısı pompası önerisi çok güçlüdür | Nüfus sayımı ipucu bu iki değeri zaten üretiyor; liste onları sunmuyor |
| **"Elektrik mi, sıcak su mu?"** | Mevcut güneş, "evet" altında | Kolektörler eski PV sayılmasın, alanları yine dolu kalsın | Önceki raporda mevcut PV'nin motoru en çok yanıltan bilgilerden biri olduğu görüldü |
| **Gündüz evde biri var mı?** (genelde / bazen / nadiren) | Elektrik | Gündüz evde olan hane güneşi kendisi daha çok kullanır; bataryanın değeri değişir. Enerji hesabı şu an herkese aynı günlük eğriyi veriyor | Veride bu bilgi için bir alan var (yük profili: evden çalışan, emekli, tam gün çalışan). Planlamacılar onu nadiren doldurmuş: kayıtların %92'si varsayılan değerde. Sorulmamış, ama önemsiz olduğu da söylenemez |
| **Değişken tarife** (Tibber gibi) var mı veya istiyor mu | Elektrik, fiyatın yanında | Batarya kararı | B kurulumcusunda değişken tarife fiyatı kayıtlı evlerin %87'sine batarya satılmış, kayıtlı olmayanların %70'ine. A kurulumcusunda oranlar %97'ye %87. Neden-sonuç olduğu kanıtlanmış değil: o alanı dolduran planlamacılar zaten daha titiz olabilir |
| **Elektrik kesintisinde yedek güç** isteniyor mu | Öncelik, ayrı bir anahtar olarak | Boyutu değil ürünü değiştirir: yedek güç verebilen inverter ve kutu. Planlamacı bunu sonradan ayrıca soruyor | Projelerin %15'inde (1.593 projenin 232'sinde) yedek güç kalemi var |
| **Isı dağıtımı:** yerden ısıtma / radyatör / ikisi | Isıtma, yalnızca ısı pompası ilgisi "evet" ise | Isı pompasının verimini en çok bu belirler. Yaş ve alandan daha bilgilendirici | Fraunhofer ISE saha ölçümü (önceki rapor) |
| **Kazanın yaşı** (10 yıldan az / 10-20 / 20+) | Isıtma, gaz/petrol altında | Aciliyet ve devlet desteğindeki hız bonusu | KfW 458 koşulları (önceki rapor) |
| **Gaz veya petrol için yıllık €** seçeneği | Isıtma | İnsanlar kWh'den çok ödediği parayı bilir. Elektrikte aylık ödemeyle yaptığımızın aynısı | Veride "yıllık ısıtma maliyeti" diye bir alan var (az dolu) |
| **Ev sahibi mi, kat mülkiyeti mi, kiracı mı** | Ev | Kat mülkiyetinde çatıya kurulum için ortak karar gerekir; teklifi baştan geçersiz kılabilir. Motoru değil, planlamacının kontrol listesini besler | Önceki raporda "kesin olmalı" diye işaretlenmişti, hâlâ sorulmuyor |
| **Sayaç panosunun fotoğrafı** (isteğe bağlı) | Gönderme öncesi özet | Planlamacı panonun yenilenmesi gerekip gerekmediğini (yaklaşık 2.000-3.500 €) yerinde ziyaret yapmadan görür. Yapay zekâ gerekmez, planlamacı fotoğrafa bakar | Projelerin **%51'inde** pano kalemi var (1.593 projenin 818'i). Planlamacının en sık tekrar eden işi bu |

Eklememeyi önerdiklerim: akıllı sayaç sorusu (çoğu kişi bilmez; motor 60% sınırını varsaymalı), gelir bandı (hassas ve bugün demo için gereksiz), çatı fotoğrafı (3D model ve hava fotoğrafı zaten var).

## 3. Sormadan, adresten çıkarılabilecekler

Zaten kullandıklarımız: yükseklikleri ölçülmüş 3D bina, hava fotoğrafı, saatlik güneş verisi, nüfus sayımından bina yaşı ve ısıtma ipucu, Münih elektrik fiyatı.

| Kaynak | Ne verir | Kime | Değer | Emek | Ne kadar emin |
|---|---|---|---|---|---|
| **Bavyera yüzey modeli** (DOM, 40 cm, ağaçlar dahil) | Ağaç gölgesi. Kaldırdığımız ağaç sorusunun yerini ölçümle tutar. Gölge şu an "ağaçlar hariç" | Planlamacı | Yüksek | Yüksek (çatı başına gölge hesabı) | Veri tüm Bavyera için var ve açık veri olarak geçiyor; lisans ve indirme yolu doğrulanmalı |
| **Bavyera anıt atlası** (BLfD) | Bina veya mahalle anıt koruması altında mı. Münih'te bu, güneş paneli için izin demek | Planlamacı, kontrol listesi | Yüksek: teklifi baştan değiştirebilir | Düşük, servis açıksa | Veri seti var, servis adresi ve lisans doğrulanmadı. Yalnızca işaret olur, "izin gerekmez" anlamına gelmez |
| **Münih ısı planı** (merkezi ısıtma yayılım bölgeleri) | Bu sokakta merkezi ısıtma geliyor mu. Geliyorsa ısı pompası yerine "merkezi ısıtmayla karşılaştır" demek gerekir | Planlamacı, ısıtma sayfasında ipucu | Orta-yüksek | Orta | Şehir haritayı Geoportal München'de yayınlayacağını söylemiş; yayında olduğu doğrulanmadı |
| **Nüfus sayımı 2022, ortalama hane büyüklüğü** (100 m hücre) | "Burada hane ortalaması 2,3 kişi" ipucu, kişi sayısı yolunda | Ev sahibi, ipucu | Düşük-orta | Düşük: bina yaşı ve ısıtmayla aynı indirme | 100 m hücre olarak yayınlandığı doğrulandı. Ev sahipliği oranı ve bina tipi yalnızca belediye düzeyinde |
| **3D bina verisinin kendi bilgileri** (kat sayısı, kullanım türü, çatı tipi) | Garajı veya müştemilatı ana evden ayırmak, oturma alanı tahminini iyileştirmek | Her ikisi | Orta | Düşük-orta | Bavyera'nın verisinde bu alanlar bulunuyor; bizim okuyucumuz şu an kullanmıyor |
| **Güneş enerjisi kayıt sistemi** (Marktstammdatenregister) | 30 kW altında adres gizli, bu yüzden evin kendi sistemi bulunamaz. Posta kodu düzeyinde komşuların ortalama sistem ve batarya boyutu çıkarılabilir | Planlamacı, kıyas | Düşük-orta | Orta (büyük indirme) | Adresin gizli olduğu yasayla sabit. Posta kodunun açık olduğu muhtemel, ama doğrulanmadı |
| **Şebeke işletmecisi** (adresten) | Münih şehrinde SWM, çevrede çoğunlukla Bayernwerk. Başvuru yolu ve süre | Planlamacı | Düşük | Düşük | Kesin |
| **Hava fotoğrafında mevcut panel bulma** | "Burada panel var gibi, doğru mu?" | Ev sahibi | Düşük | Yüksek | Önceki rapor: doğrudan sormak daha ucuz. Katılıyorum |

Kurallarla ilgili, soru gerektirmeyen bir ekleme: 2025'ten beri akıllı sayacı olmayan yeni sistemler gücünün en fazla %60'ını şebekeye verebiliyor. Batarya bu fazlayı emer. Motor bunu kendisi varsaymalı; ev sahibine sorulacak bir şey değil.

## 4. Bugün 15:00'e kadar ne yapılmalı

Teslim bugün. Önerim yalnızca küçük ve riski düşük işler:

1. **Isıtma listesine merkezi ısıtma ve elektrikli ısıtma** ekle. Motor merkezi ısıtmayı "ısı pompası önerme" diye, elektrikli ısıtmayı "ısı pompası adayı" diye okusun. Yaklaşık yarım saat.
2. **Mevcut güneş sorusuna "elektrik / sıcak su"** ekle. Sıcak su ise alan dolu kalsın, eski PV sayılmasın. Yarım saat.
3. **Ev sahipliği** (tek dokunuş) ve **yedek güç isteği** yalnızca planlamacının kontrol listesine gitsin. Motoru değiştirmez.
4. Diğer her şey (ağaç gölgesi, anıt atlası, ısı planı, sayaç fotoğrafı) sunumda **"adresten daha fazlası"** başlıklı bir yol haritası sayfası olsun. Bu, "ev sahibini yormadan daha iyi tasarım" hikâyesini güçlendirir ve demo riskini artırmaz.

## Karar bekleyenler

- Gündüz evde olma sorusu enerji hesabına bağlansın mı? Bağlanırsa batarya tasarrufu değişir, bu da kontrol edilmesi gereken yeni bir sayı demek.
- Sayaç panosu fotoğrafı veri kuralı açısından sorun değil (Reonic verisi değil, ev sahibinin kendi fotoğrafı ve dışarı gönderilmiyor), ama ekip onaylamalı.

## Kaynaklar

- Küçük sistemlerde adresin gizli tutulması: [§ 15 MaStRV](https://www.gesetze-im-internet.de/mastrv/__15.html), [IHK bilgi notu](https://www.ihk.de/blueprint/servlet/resource/blob/4372950/4d6c5944cd93f99c0131cdba65c2bf4c/factsheet-mastr-der-bundesnetzagentur-data.pdf), [open-MaStR](https://open-mastr.readthedocs.io/en/latest/dataset/)
- Anıt verisi: [BLfD veri seti kaydı](https://gdk.gdi-de.org/geonetwork/srv/api/records/2968f426-ca62-4d43-adb6-706cc3c8c317)
- Yüzey modeli: [Bavyera açık veri bülteni 2024/07](https://geodaten.bayern.de/odd/m/3/pdf/newsletter_archiv/2024_07.pdf), [OSM forumu, Bavyera açık veri](https://community.openstreetmap.org/t/bayern-ab-01-01-2023-sind-viele-geobasisdaten-der-vermessungsverwaltung-kosten-frei-verfugbar-nutzbarkeit-fur-osm-ist-noch-zu-prufen/7051)
- Nüfus sayımı: [Destatis Zensus 2022](https://www.destatis.de/DE/Themen/Gesellschaft-Umwelt/Bevoelkerung/Zensus2022/_inhalt.html)
- Münih ısı planı: [SWM ısı planlaması](https://www.swm.de/energieloesungen/kommunale-waermeplanung), [Münih ısı tüzüğü](https://stadt.muenchen.de/rathaus/stadtrecht/vorschrift/200/version1/0.html)
- %60 sınırı: [pv magazine](https://www.pv-magazine.de/2025/12/22/keine-angst-vor-dem-solarspitzengesetz-wir-erlaeutern-die-neue-erloessituation/), [Verbraucherzentrale Hamburg](https://www.vzhh.de/themen/bauen-immobilien-energie/erneuerbare-energien/solarspitzen-foerdergelder-neue-regeln-fuer-photovoltaikanlagen)
