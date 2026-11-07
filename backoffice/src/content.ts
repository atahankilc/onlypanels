export type Status = "var" | "kismen" | "yok";
export const STATUS: Record<Status, string> = { var: "Var", kismen: "Kısmen", yok: "Yok" };

export const USERS = [
  {
    id: "planner", name: "Planlayıcı", role: "Kurulumcu firmasında tasarımı ve teklifi hazırlayan kişi",
    focus: "Minimum sonuç bu kullanıcı için",
    who: "Orta ölçekli bir kurulum firmasında çalışır. Günde birkaç teklif hazırlar, çoğu zaman saha ziyaretleri arasında. Ürünleri iyi bilir ama sürekli zaman baskısı altındadır.",
    wants: "Hemen, güvenebileceği ve üzerine teklif kurabileceği sağlam bir ilk tasarım.",
    needs: "Kontrol: tasarımın her parçasını değiştirebilmek ve teklifte son sözü söylemek.",
    fears: "Ev sahibine savunamayacağı bir şey öneren kara kutu.",
  },
  {
    id: "homeowner", name: "Ev sahibi", role: "Teklifi alan ve imzalayıp imzalamayacağına karar veren kişi",
    focus: "Stretch hedef, aynı motorun üstüne eklenir",
    who: "Müstakil bir evin sahibidir. Kurulumcudan güneş paneli, belki batarya veya ısı pompası içeren bir teklif almıştır. Şimdi imzalayıp imzalamayacağına karar vermelidir.",
    wants: "Teklifi anlamak, daha büyük batarya veya ısı pompası olmadan gibi varyantlar denemek ve her değişikliğin kendisi için ne demek olduğunu görmek.",
    needs: "Sadelik: teknik veri sayfaları yerine sade dil.",
    fears: "Gereğinden fazla satılmak veya yanlış sisteme bağlanmak.",
  },
];

export const TENSION = [
  { label: "Planlayıcı ister", text: "Hız ve teknik ile ticari olarak sağlam bir teklif üzerinde tam kontrol." },
  { label: "Ev sahibi ister", text: "Şeffaflık ve deneme alanı, ama sadece kurulumcunun izin verdiği seçeneklerde." },
  { label: "Sınır", text: "Örneğin batarya açıp kapatmak veya bir parçayı boyutlandırmak serbest. Evin verisi sabit kalır." },
];

export type Step = { who: string; does: string; status: Status };
export const FLOWS: { name: string; who: string; need: string; goal: string; steps: Step[] }[] = [
  {
    name: "Hızlı teklif", who: "Planlayıcı", need: "Minimum",
    goal: "Yeni projenin temel bilgilerini girer, teklif için başlangıç olacak tam tasarımı alır.",
    steps: [
      { who: "Planlayıcı", does: "Ev hakkında birkaç temel bilgi girer", status: "var" },
      { who: "Sistem", does: "Panel, batarya ve ısı pompasını gerektiği kadar önerir, gerekmiyorsa önermez", status: "kismen" },
      { who: "Sistem", does: "Kısa bir gerekçe gösterir", status: "var" },
      { who: "Planlayıcı", does: "Bir bilgiyi veya parçayı değiştirir, örneğin \"aile gelecek yıl elektrikli araba alıyor\"", status: "kismen" },
      { who: "Sistem", does: "Tasarımın geri kalanı uzmanın beklediği gibi uyum sağlar ve nedenini anlatır", status: "var" },
      { who: "Planlayıcı", does: "Öneriyi uzmanın o projedeki tasarımıyla karşılaştırır", status: "var" },
    ],
  },
  {
    name: "Tasarım doğrulama", who: "Planlayıcı", need: "Stretch",
    goal: "Teklif çıkmadan önce kendi tasarımını uzmanların benzer evlerde yaptıklarıyla karşılaştırır.",
    steps: [
      { who: "Planlayıcı", does: "Kendi tasarımını girer", status: "var" },
      { who: "Sistem", does: "Benzer evlerde uzmanların ne yaptığıyla karşılaştırır", status: "kismen" },
      { who: "Sistem", does: "Alışılmadık seçimi işaretler, örneğin çok büyük bir batarya", status: "yok" },
    ],
  },
  {
    name: "Teklifi keşfetme", who: "Ev sahibi", need: "Stretch",
    goal: "Teklifi alan ev sahibi izin verilen varyantları dener ve imzadan önce her değişikliği anlar.",
    steps: [
      { who: "Ev sahibi", does: "Teklifini sade dille görür", status: "yok" },
      { who: "Ev sahibi", does: "Kurulumcunun izin verdiği seçenekleri dener", status: "yok" },
      { who: "Sistem", does: "Her değişikliğin ne anlama geldiğini açıklar", status: "yok" },
    ],
  },
];

export const ASK = {
  core: "Birkaç bilgiden, deneyimli bir planlayıcının vereceği kararı veren bir sistem. Amaç en iyi sistemi hesaplamak değil, uzmanın gerçekte yapacağını yapmak.",
  groups: [
    { title: "Üç hedef", items: ["Tam sistem öner: panel, batarya, ısı pompası gerekiyorsa ve boyutlarıyla", "Kullanıcı değiştirebilsin: gerisi uzman gibi uyum sağlasın", "Uzman gibi karar verdiğini görülmemiş projelerde kanıtla"] },
    { title: "Demoda görmek istedikleri", items: ["Ev anlatılır", "Tam sistem açıklamasıyla çıkar", "Tasarım değişir, örneğin elektrikli araba", "Uzmanla ve çok sayıda projeyle karşılaştırılır"] },
    { title: "Teslim", items: ["Çalışan demo, yedek olarak video", "Kod ve kısa README", "Kısa sunum"] },
    { title: "Puanlama", items: ["Teknik derinlik", "Kullanıcıya uyum", "İş değeri", "Uygulama ve demo"] },
  ],
};

export type Real = { step: string; pain: string; src: "Brief" | "Çıkarım" };
export const REAL: { who: string; intro: string; steps: Real[] }[] = [
  {
    who: "Planlayıcı", intro: "Bugün her ev için bu yolu baştan yürüyor.",
    steps: [
      { step: "Talep gelir", pain: "Aynı anda birçok iş var", src: "Brief" },
      { step: "Evin bilgilerini toplar: tüketim, ısıtma, araba, fiyat, bütçe", pain: "Bilgi eksik veya yaklaşık gelir", src: "Çıkarım" },
      { step: "Evi veya çatıyı kontrol eder", pain: "Ofisle saha arasında gidip gelir", src: "Çıkarım" },
      { step: "Paneli boyutlandırır", pain: "Her ev farklı, sıfırdan başlar", src: "Brief" },
      { step: "Batarya karşılığını verir mi, ne kadar olmalı, karar verir", pain: "Panele bağlı, biri değişince diğeri de değişir", src: "Brief" },
      { step: "Isı pompası mantıklı mı, kontrol eder", pain: "Tüketimi değiştirir, panele geri döner", src: "Brief" },
      { step: "Hepsini müşterinin bütçesiyle dengeler", pain: "Bilgi kişinin kafasında, herkes farklı uygular", src: "Brief" },
      { step: "Teklifi yazar ve gönderir", pain: "Saatler geçmiştir, müşteri başkasına gidebilir", src: "Brief" },
      { step: "Müşterinin sorularına cevap verir, değişiklik yapar", pain: "Bir değişiklik tüm hesabı yeniden açar", src: "Çıkarım" },
    ],
  },
  {
    who: "Ev sahibi", intro: "Aynı süreci diğer taraftan yaşıyor.",
    steps: [
      { step: "Daha düşük fatura ve bağımsızlık ister", pain: "Neye ihtiyacı olduğunu bilmez", src: "Brief" },
      { step: "Birkaç kurulumcuya başvurur", pain: "Beklerken ilk güvenilir teklife yönelir", src: "Brief" },
      { step: "Evinin bilgilerini verir", pain: "Tüketimini tam bilmeyebilir", src: "Çıkarım" },
      { step: "Teklifi alır ve anlamaya çalışır", pain: "Teknik sayfalar, neden bu boyut belli değil", src: "Brief" },
      { step: "Teklifleri karşılaştırır", pain: "Fazla satılıyor olmaktan korkar", src: "Brief" },
      { step: "Planlayıcıya soru sorar, varyant ister", pain: "Her soru için cevap beklemek zorunda", src: "Çıkarım" },
      { step: "İmzalar veya vazgeçer", pain: "Yanlış sisteme bağlanmaktan korkar", src: "Brief" },
    ],
  },
];

export const VALUE = [
  { today: "Her tasarım sıfırdan başlar", ours: "Temel bilgilerden tam tasarım çıkar", who: "Planlayıcı", gain: "Daha hızlı teklif", state: "Çalışıyor" },
  { today: "Bir değişiklik tüm hesabı açar", ours: "Değişince gerisi kendiliğinden uyum sağlar", who: "Planlayıcı", gain: "Daha hızlı revizyon", state: "Çalışıyor" },
  { today: "Neden bu boyut, açıklamak zor", ours: "Her öneride kısa gerekçe ve benzer evler", who: "Planlayıcı", gain: "Savunulabilir teklif", state: "Temel hali var" },
  { today: "Bilgi deneyimli kişilerin kafasında", ours: "Geçmiş uzman kararlarından öğrenir", who: "Kurulumcu", gain: "Yeni çalışan da tutarlı tasarlar", state: "Sınırlı, doğruluk düşük" },
  { today: "Hata teklif çıktıktan sonra fark edilir", ours: "Alışılmadık seçim önceden işaretlenir", who: "Kurulumcu", gain: "Daha az yanlış teklif", state: "Yapılmadı" },
  { today: "Ev sahibi her soruda bekler", ours: "İzin verilen varyantları kendisi dener", who: "İkisi de", gain: "Daha az soru, daha güvenli karar", state: "Yapılmadı" },
];

export const CANNOT = [
  "Kazanma oranı ölçülemez, çünkü veride sadece imzalanmış projeler var.",
  "Kazanılan süreyi söyleyemeyiz. Bugün bir tasarımın kaç dakika sürdüğünü Reonic'ten öğrenmeliyiz.",
  "\"Uzman kadar doğru\" diyemeyiz. İlk öneri basit yöntemlerden sadece biraz daha iyi.",
];
