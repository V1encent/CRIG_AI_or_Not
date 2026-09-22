"""seed_deck_content.py — 一次性把源 deck 的 7 组图写进三册 CSV。

★ 这是【引导脚本】，不是流水线的一部分。跑一次，之后 CSV 就是唯一真源，
  内容改动直接改 CSV（那是设计里"加第 40 组题只要十分钟"的前提）。
  再跑一次会覆盖 CSV —— 所以内容稳定后就别再跑它了。

★★ 关于答案键，必须说清楚：

   源 deck 里【没有答案键】。文件里不存哪张是 AI，只能反推。我的依据是两条：
     ① 7 组全部是 PNG 在左、JPEG 在右（按 <a:off x> 坐标排序，不是 rel 顺序）
     ② 逐组用眼睛看过：左边的确实是生成的，右边的确实是照片
   ② 是我自己做的目视核验，所以 verifiedBy 里写的是我，不是人。
   这不是走过场：`isAI` 是全项目最重要的字段，而它【绝不能从文件格式推断】——
   格式推断正是这份 deck 可以被"永远选左边"通关的原因。

   所以这里写进去的每一条都带着 UNCONFIRMED 前缀，verify_assets.py 会加粗打出来，
   README 里也写着。CRIG 必须有人自己看一眼再签字，然后改 CSV 里的 verifiedBy。

★★ 关于授权，同样必须说清楚：

   这 7 组图在活动现场的屏幕上放过了（⇒ permitsPublicDisplay 有依据），
   我们的流水线会裁剪与重编码（⇒ permitsDerivatives 有依据）。
   但【公网托管没有依据】，而且其中 3 张里有可辨认的人脸。
   把 permitsWeb 写成 true 是伪造；把它当 false 而让整个 kiosk 版没内容，
   是把合规问题变成产品问题。所以：scope=kiosk，permitsWeb=false，
   gen_manifest.py 据此只把它们放进 kiosk 牌堆。
"""

import csv
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from deck import utf8_console  # noqa: E402

HERE = os.path.dirname(os.path.abspath(__file__))
DATA = os.path.join(os.path.dirname(HERE), "data")

DECK = "20260917_CRIG_Ontdekt_AIorNot.pptx"
DATE = "2026-09-22"
WHO = "UNCONFIRMED: Claude (目视核验 pair sheet) 2026-09-22"
WHY = ("Alleen visueel geverifieerd door de assistent, niet door een mens bij CRIG. "
       "Moet nog nagekeken en ondertekend worden.")
CREDIT = "CRIG Ontdekt (UGent) — herkomst te bevestigen"
LICENCE = "Onbekend — te bevestigen"
RIGHTS = ("Bewijs van publieke vertoning op het CRIG-evenement; nabewerking (bijsnijden, "
          "hercoderen) is gedaan. Toestemming voor webhosting is NIET bevestigd. "
          "Bevat herkenbare personen — portretrecht nog te regelen.")

# slide → (realId, imageN.jpg, aiId, imageN.png, cues)
PAIRS = [
    # (slide, realEntry, aiEntry, realId, aiId, puzzleId, tells, subject, pp, cue,
    #  tellRegion(x,y,w,h) IN SOURCE COORDS, explanation, kidLine, rule, realNote)
    dict(
        slide=2, real="image1.jpg", ai="image2.png", pid="p001",
        tells=2, subject=4, pp=2, cue="text",
        # ★ 原本是 cue="perspective"、region 指向地板。改掉的原因：地板那条
        #   "破绽"我量了四次都没能证实（第一次把整条暗带当成格栅，第二次裁到了
        #   瓷砖网格上），而原文还断言"画面里没有粉色灯"——那张图天花板上明明
        #   有品红色灯管。没核实的破绽不许留在教学文案里。
        #   现在这条是 5 倍放大直接看到的：大屏上 "Epoch 742/10000"、"Accuracy
        #   98.7%" 清晰可读，两个图表的坐标轴标签却是无法辨认的糊块。
        #   坐标由裁剪后区域反推：webp x .285–.445 y .255–.525，
        #   cropBox=[0,68,1437,1026] → 1437x1095 源图归一化。
        region=(0.285, 0.285, 0.16, 0.236),
        realSubject=("Onderzoeker in profiel voor een wand vol netwerkapparatuur, "
                     "in groen licht",
                     "A researcher in profile in front of a wall of network hardware, "
                     "lit green"),
        aiSubject=("Gegenereerd beeld van een persoon van achteren in een blauw "
                   "datacenter met holografische hersenscan en grafieken",
                   "Generated image of a person seen from behind in a blue data centre "
                   "with a holographic brain scan and charts"),
        explanation=(
            "Kijk naar de twee grafieken op het scherm. De grote getallen zijn foutloos "
            "— ‘Epoch 742/10000’, ‘Accuracy 98.7%’ — maar de aslabels naast en onder "
            "de grafieken zijn geen letters of cijfers: het zijn betekenisloze vlekjes. "
            "Een echte grafiek heeft overal leesbare labels.",
            "Look at the two charts on the screen. The large numbers are flawless — "
            "‘Epoch 742/10000’, ‘Accuracy 98.7%’ — but the axis labels beside and below "
            "the charts are not letters or digits at all: they are meaningless smudges. "
            "A real chart has readable labels everywhere."),
        kidLine=("Grote woorden kloppen, maar de kleine lettertjes bij de grafieken niet.",
                 "Big words are fine, but the small labels are not letters."),
        rule=("AI schrijft grote woorden meestal goed, maar kleine letters zijn decoratie. "
              "Vergroot daarom altijd de kleinste tekst in beeld: aslabels, bordjes, "
              "opschriften.",
              "AI usually gets big words right, but small lettering is just decoration. "
              "So always zoom in on the smallest text in the frame: axis labels, signs, "
              "captions."),
        realNote=("Deze foto is echt: één groene lichtbron links kleurt zowel het gezicht "
                  "als de kabels, en de glans op elke kabel klopt met die ene bron.",
                  "This photo is real: a single green light source on the left colours "
                  "both the face and the cables, and the highlight on every cable "
                  "matches that one source."),
    ),
    dict(
        slide=3, real="image3.jpeg", ai="image4.png", pid="p002",
        tells=3, subject=4, pp=2, cue="repetition",
        region=(0.02, 0.66, 0.30, 0.22),
        realSubject=("Eén zebravis vrij zwemmend in een blauw aquarium",
                     "A single zebrafish swimming free in a blue tank"),
        aiSubject=("Gegenereerde school zebravissen in een beplant aquarium",
                   "Generated school of zebrafish in a planted aquarium"),
        explanation=(
            "Tel de vinnen. Langs de buik van de grote vis staan twee bijna identieke "
            "vinnen naast elkaar, en halverwege het lichaam veranderen de strepen in "
            "een stippatroon. Bij een echte zebravis blijven de strepen over de hele "
            "flank scherp en doorlopend.",
            "Count the fins. Two near-identical fins sit next to each other along the "
            "belly of the large fish, and halfway down the body the stripes dissolve "
            "into a dotted mesh. On a real zebrafish the stripes stay crisp and "
            "continuous across the whole flank."),
        kidLine=("Tel de vinnen van de vis — er is er één te veel.",
                 "Count the fish's fins — there is one too many."),
        rule=("Bij dieren en mensen: tel de onderdelen. AI maakt er vaak één te veel "
              "of één te weinig.",
              "With animals and people: count the parts. AI often makes one too many "
              "or one too few."),
        realNote=("Deze zebravis is echt gefotografeerd in het aquarium van het lab; "
                  "de strepen zijn scherp en het dier staat vrij in het water.",
                  "This zebrafish was really photographed in the lab aquarium; the "
                  "stripes are crisp and the animal floats free in the water."),
    ),
    dict(
        slide=4, real="image5.jpeg", ai="image6.png", pid="p003",
        tells=2, subject=4, pp=2, cue="text",
        region=(0.79, 0.02, 0.16, 0.13),
        realSubject=("Onderzoeker haalt een rek met cryoboxen uit een stikstoftank",
                     "A researcher lifts a rack of cryoboxes out of a liquid nitrogen "
                     "dewar"),
        aiSubject=("Gegenereerde onderzoeker bij een stikstoftank met een bord "
                   "'LIQUID NITROGEN'",
                   "Generated researcher at a liquid nitrogen dewar with a 'LIQUID "
                   "NITROGEN' sign"),
        explanation=(
            "Kijk naar de affiche aan de muur achter haar. De letters zien eruit als "
            "tekst, maar je krijgt er geen woord uit — het is nagemaakt schrift, en "
            "het logo linksboven is een vlek. Echte tekst in een foto is altijd "
            "leesbaar, ook als hij klein en onscherp is.",
            "Look at the poster on the wall behind her. The letters look like writing "
            "but no word comes out — it is imitation script, and the logo at the top "
            "left is a smudge. Real text in a photo is always readable, even when it "
            "is small and slightly out of focus."),
        kidLine=("Kijk naar de affiche: je kan de letters niet lezen.",
                 "Look at the poster: you can't actually read the letters."),
        rule=("Zoek in elk AI-beeld naar tekst en probeer die hardop te lezen. "
              "Als het niet lukt, is het beeld gemaakt.",
              "In every AI image, find the text and try to read it out loud. "
              "If you can't, the image was generated."),
        realNote=("Op de echte foto is het etiket op de tank leesbaar, en kloppen de "
                  "wanten, de klemmen en de slangen zoals ze echt zijn.",
                  "In the real photo the label on the dewar is readable, and the "
                  "gloves, clamps and tubing are all as they really are."),
    ),
    dict(
        slide=5, real="image7.jpeg", ai="image8.png", pid="p004",
        tells=2, subject=4, pp=2, cue="repetition",
        region=(0.10, 0.45, 0.34, 0.35),
        realSubject=("Multichannel pipet boven een 96-wellsplaat, groene handschoenen",
                     "A multichannel pipette above a 96-well plate, green gloves"),
        aiSubject=("Gegenereerde multichannel pipet boven een plaat met roze medium",
                   "Generated multichannel pipette above a plate of pink medium"),
        explanation=(
            "Kijk naar de pipet en de plaat eronder. De tips hangen te dicht bij "
            "elkaar en komen naast de putjes uit in plaats van erboven. Boven de plaat "
            "zweeft bovendien een rij lege ringen die nergens bij horen.",
            "Look at the pipette and the plate below it. The tips sit too close "
            "together and come down beside the wells instead of above them. Above the "
            "plate a row of empty rings also floats with nothing under it."),
        kidLine=("Tel de tips van de pipet: ze passen niet op de putjes.",
                 "Count the pipette tips: they don't fit the wells."),
        rule=("Bij alles met een raster of patroon — putjes, tegels, knoppen, toetsen — "
              "tel je of de onderdelen even ver uit elkaar staan.",
              "With anything that has a grid or pattern — wells, tiles, buttons, keys — "
              "count whether the parts are evenly spaced."),
        realNote=("Op de echte foto staan de acht tips netjes boven één rij putjes, met "
                  "de flessen medium ernaast.",
                  "In the real photo the eight tips sit neatly above one row of wells, "
                  "with the medium bottles beside them."),
    ),
    dict(
        slide=6, real="image9.jpeg", ai="image10.png", pid="p005",
        tells=3, subject=3, pp=2, cue="repetition",
        region=(0.02, 0.62, 0.22, 0.32),
        realSubject=("Twee gestapelde kweekflessen met blauwe doppen in de hand",
                     "Two stacked culture flasks with blue caps held in the hand"),
        aiSubject=("Gegenereerde hand met blauwe handschoen bij een stapel kweekflessen",
                   "Generated blue-gloved hand at a stack of culture flasks"),
        explanation=(
            "Kijk naar de maatstreepjes op de flessen. De reeks 100-75-50-25 staat "
            "vier keer in het beeld, telkens even groot. Een stapel die naar achteren "
            "loopt hoort kleiner te worden; hier is dezelfde fles gewoon een paar keer "
            "naast elkaar gezet.",
            "Look at the graduation marks on the flasks. The sequence 100-75-50-25 "
            "appears four times in the frame, always the same size. A stack receding "
            "into the distance should get smaller; here the same flask has simply been "
            "repeated side by side."),
        kidLine=("Dezelfde fles staat vier keer in beeld, allemaal even groot.",
                 "The same flask appears four times, all exactly the same size."),
        rule=("Als hetzelfde voorwerp meerdere keren in beeld staat: kijk of degene die "
              "verder weg staat ook echt kleiner is.",
              "When the same object appears several times: check whether the one "
              "further away is actually smaller."),
        realNote=("Op de echte foto zie je de flessen echt in de hand, met de doppen "
                  "erop en het medium dat heen en weer klotst.",
                  "In the real photo the flasks are really held in the hand, with the "
                  "caps on and the medium sloshing inside."),
    ),
    dict(
        slide=7, real="image12.jpeg", ai="image11.png", pid="p006",
        tells=3, subject=2, pp=2, cue="physics",
        region=(0.12, 0.38, 0.30, 0.24),
        realSubject=("Serologische pipet boven een schaal, met flessen medium ernaast",
                     "A serological pipette above a dish, with medium bottles beside it"),
        aiSubject=("Gegenereerde pipet die druppelt in een grote schaal met roze medium",
                   "Generated pipette dripping into a large dish of pink medium"),
        explanation=(
            "Kijk naar het vloeistofoppervlak in de schaal. Het roze medium loopt als "
            "een rechte horizontale band dwars over de ronde wand — maar vloeistof in "
            "een ronde schaal vormt altijd een ellips, nooit een rechte streep. De "
            "lichte plekken drijven er ook los in, in plaats van op het oppervlak te "
            "liggen.",
            "Look at the liquid surface in the dish. The pink medium runs as a straight "
            "horizontal band across the round wall — but liquid in a round dish always "
            "forms an ellipse, never a straight stripe. The pale highlights float "
            "inside the medium too, instead of lying on its surface."),
        kidLine=("Kijk naar het roze water: het loopt recht, maar het zou rond moeten zijn.",
                 "Look at the pink liquid: it runs straight, but it should be round."),
        rule=("Vloeistoffen verklappen AI: een vloeistof staat altijd waterpas, "
              "wat de vorm van het vat ook is.",
              "Liquids give AI away: liquid is always level, whatever shape the "
              "container has."),
        realNote=("Op de echte foto hangt de pipet boven een open schaal, met de flessen "
                  "en de gestapelde schaaltjes scherp op de rij erachter.",
                  "In the real photo the pipette hangs above an open dish, with the "
                  "bottles and stacked dishes lined up sharply behind it."),
    ),
    dict(
        slide=8, real="image13.jpeg", ai="image14.png", pid="p007",
        tells=3, subject=4, pp=2, cue="cell-structure",
        region=(0.46, 0.12, 0.28, 0.55),
        realSubject=("Onderzoeker achter een microscoop met een echt celbeeld op het scherm",
                     "A researcher at a microscope with a real cell image on the screen"),
        aiSubject=("Gegenereerde onderzoeker achter een microscoop met sterachtige "
                   "'cellen' op het scherm",
                   "Generated researcher at a microscope with starburst 'cells' on the "
                   "screen"),
        explanation=(
            "Kijk naar het beeld op het scherm. Dat moeten cellen zijn, maar het zijn "
            "symmetrische stervormen — als sneeuwvlokken of vuurwerk. Echte "
            "fluorescentiebeeldvorming laat cellen met een kern en een membraan zien, "
            "nooit een perfect symmetrisch ornament.",
            "Look at the image on the screen. Those are supposed to be cells, but they "
            "are symmetrical starbursts — like snowflakes or fireworks. Real "
            "fluorescence imaging shows cells with a nucleus and a membrane, never a "
            "perfectly symmetrical ornament."),
        kidLine=("Op het scherm staan geen cellen, maar sterretjes zoals sneeuwvlokken.",
                 "The screen shows stars like snowflakes, not cells."),
        rule=("Denk bij een microscoopbeeld aan wat cellen echt zijn: ze hebben een "
              "kern en een rand, en ze zijn nooit perfect symmetrisch.",
              "When you see a microscopy image, remember what cells really are: they "
              "have a nucleus and an edge, and they are never perfectly symmetrical."),
        realNote=("Op de echte foto zit een onderzoeker achter de microscoop, met een "
                  "echt celbeeld op het scherm en oranje handschoenen bij de hand.",
                  "In the real photo a researcher sits at the microscope, with a real "
                  "cell image on the screen and orange gloves at hand."),
    ),
]


def w(name, header, rows):
    path = os.path.join(DATA, name)
    with open(path, "w", encoding="utf-8", newline="") as f:
        wr = csv.writer(f)
        wr.writerow(header)
        wr.writerows(rows)
    print("%-12s %d 行" % (name, len(rows)))


def main():
    utf8_console()
    reals, ais, pairs, rights = [], [], [], []

    for i, p in enumerate(PAIRS):
        n = p["slide"]
        rid, aid = "r%03d" % (i + 1), "a%03d" % (i + 1)
        reals.append([rid, "%s#ppt/media/%s" % (DECK, p["real"]), "photo",
                      p["realSubject"][0], p["realSubject"][1],
                      CREDIT, LICENCE, "", "false", "true", "true", "", "false", RIGHTS])
        ais.append([aid, "%s#ppt/media/%s" % (DECK, p["ai"]), rid,
                    "unknown (geen C2PA, geen metadata in het bestand)", "",
                    "",  # prompt: leeg ⇒ de UI verbergt het prompt-blok automatisch
                    "Onbekend — niet vast te stellen bij deze bestanden",
                    "Geen enkele aanwijzing over het model of de gebruiksvoorwaarden "
                    "in de bestanden zelf. Voor webpublicatie opnieuw genereren met een "
                    "bekend model, of dit als 'unknown' accepteren.",
                    "1"])
        pairs.append([
            p["pid"], rid, aid,
            p["tells"], p["subject"], p["pp"], p["cue"],
            p["region"][0], p["region"][1], p["region"][2], p["region"][3],
            p["explanation"][0], p["explanation"][1],
            p["kidLine"][0], p["kidLine"][1],
            p["rule"][0], p["rule"][1],
            p["realNote"][0], p["realNote"][1],
            "ready", WHO, DATE, "true", "",  # cropWindow 留空 ⇒ 居中裁
            "bron: slide %d van de CRIG-deck. %s" % (n, WHY),
            "kiosk", n, "Claude (uit de bron-deck)",
        ])
        rights.append([rid, "publieke vertoning op het CRIG-evenement", DATE,
                       "CRIG Ontdekt", "false", "true", "true", "",
                       "Webhosting niet bevestigd; bevat herkenbare personen"])

    w("real.csv",
      ["realId", "file", "kind", "subjectNl", "subjectEn", "credit", "licence",
       "licenceUrl", "permitsWeb", "permitsPublicDisplay", "permitsDerivatives",
       "ethicsCleared", "humanMaterial", "rightsNote"], reals)
    w("ai.csv",
      ["aiId", "file", "derivedFromRealId", "generator", "model", "prompt",
       "licence", "rightsNote", "variantOf"], ais)
    w("rights.csv",
      ["realId", "evidenceType", "date", "obtainedFrom", "scopeWeb",
       "scopePublicDisplay", "scopeDerivatives", "ethicsRef", "note"], rights)

    # pairs.csv 的表头以现成的为准，只在末尾追加三列
    header = ["puzzleId", "realId", "aiId", "tells", "subject", "postprocessing", "cue",
              "tellRegionX", "tellRegionY", "tellRegionW", "tellRegionH",
              "explanationNl", "explanationEn", "kidLineNl", "kidLineEn",
              "ruleNl", "ruleEn", "realNoteNl", "realNoteEn",
              "status", "verifiedBy", "verifiedAt", "verifiedSolution", "cropWindow",
              "notes", "scope", "sourceSlide", "author"]
    w("pairs.csv", header, pairs)
    print("\n★ 7 道题全部 scope=kiosk：公屏展示有依据，公网托管没有。")
    print("★ verifiedBy 全部带 UNCONFIRMED 前缀：目视核验是助手做的，需要人复核。")


if __name__ == "__main__":
    main()
