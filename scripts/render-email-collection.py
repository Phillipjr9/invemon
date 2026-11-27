"""Render deterministic dimensional email illustrations and the exact homepage brand mark.
Development dependency: Pillow. Output PNGs require no email-client scripting or SVG support.
"""
from PIL import Image, ImageDraw, ImageFilter
from pathlib import Path
import math
ROOT=Path(__file__).resolve().parent.parent/'public/assets/email'
ROOT.mkdir(parents=True,exist_ok=True)
S=3

def scene(kind):
 im=Image.new('RGB',(560*S,260*S),'#e9eee0')
 shadow=Image.new('RGBA',im.size);d=ImageDraw.Draw(shadow)
 d.ellipse((170*S,211*S,400*S,236*S),fill=(25,70,55,55));shadow=shadow.filter(ImageFilter.GaussianBlur(10*S));im.paste(shadow,(0,0),shadow)
 d=ImageDraw.Draw(im)
 def poly(p,c):d.polygon([(int(x*S),int(y*S)) for x,y in p],fill=c)
 def line(p,c='#d3bf8c',w=4):d.line([(int(x*S),int(y*S)) for x,y in p],fill=c,width=w*S,joint='curve')
 def oval(box,c):d.ellipse(tuple(int(v*S) for v in box),fill=c)
 def panel(x,y,w,h,c='#fafbf5',depth=12):
  poly([(x,y),(x+w,y),(x+w+depth,y-depth),(x+depth,y-depth)],'#d5dfc8')
  poly([(x+w,y),(x+w+depth,y-depth),(x+w+depth,y+h-depth),(x+w,y+h)],'#91a986')
  poly([(x,y),(x+w,y),(x+w,y+h),(x,y+h)],c)
 def check(x,y):line([(x-14,y),(x-3,y+10),(x+20,y-17)],'#d6bd86',6)
 # Subtle orbit and pedestal unite the collection, while each object is unique.
 d.arc((125*S,23*S,435*S,230*S),190,340,fill='#cbd7bc',width=1*S)
 oval((165,205,405,241),'#cad7ba');oval((165,198,405,231),'#dce5cf')
 if kind=='welcome':
  panel(214,67,132,119,'#fafbf5');line([(235,91),(307,91)],'#b5c5a5',3);line([(235,104),(294,104)],'#b5c5a5',3)
  panel(191,120,178,80,'#194637');poly([(191,120),(280,170),(369,120)],'#3d7054');poly([(191,200),(280,150),(369,200)],'#2c6045');oval((264,157,297,190),'#d7bb81');check(280,172)
 elif kind in ('sign_in','verify'):
  pts=[(280,42),(347,68),(341,137),(323,172),(280,201),(237,172),(219,137),(213,68)]
  poly([(x+13,y-8) for x,y in pts],'#12392c');poly(pts,'#2e6249');poly([(280,54),(334,76),(328,135),(312,161),(280,184)],'#3f7658')
  if kind=='sign_in':
   oval((254,83,288,117),'#dfc894');panel(245,120,56,32,'#d5bd85',5);oval((306,146,351,191),'#f8faf1');check(327,170)
  else:check(277,124);oval((314,153,352,191),'#d5bd85');line([(333,160),(333,177)],'#194637',3);oval((331,181,335,185),'#194637')
 elif kind in ('password_changed','reset'):
  d.arc((235*S,45*S,314*S,139*S),180,360,fill='#a5ba93',width=14*S)
  d.arc((242*S,49*S,321*S,143*S),180,360,fill='#d9c18b',width=10*S)
  panel(222,100,112,99,'#194637');oval((268,125,286,143),'#dfc894');poly([(273,137),(281,137),(284,158),(270,158)],'#dfc894')
  if kind=='password_changed':oval((307,163,355,211),'#f8faf1');check(329,189)
  else:
   oval((315,158,343,186),'#d5bd85');line([(331,181),(356,206),(365,197)],'#d5bd85',8);line([(346,196),(354,188)],'#d5bd85',6)
 elif kind=='support_received':
  panel(197,63,140,91,'#194637');poly([(218,154),(218,176),(247,154)],'#194637')
  for x in [228,265,302]:oval((x,99,x+9,108),'#d7c28b')
  panel(270,133,90,57,'#fafbf5',9);poly([(327,190),(350,205),(350,190)],'#fafbf5');line([(284,151),(341,151)],'#acbd9d',3);line([(284,164),(325,164)],'#acbd9d',3)
 elif kind=='workspace_saved':
  panel(200,64,155,119,'#194637');panel(215,79,122,80,'#e4ebd8',5)
  for x,h in [(235,23),(263,40),(291,55)]:panel(x,145-h,17,h,'#72946c',4)
  panel(227,190,106,9,'#a5b996',6);line([(278,181),(278,190)],'#78936e',8)
  oval((320,146,369,195),'#fafbf5');check(343,172)
 else:
  panel(220,83,115,111,'#194637');poly([(220,83),(277,48),(335,83),(277,119)],'#537d57');poly([(277,119),(335,83),(335,194),(277,225)],'#123b2d')
  line([(277,52),(277,115),(277,221)],'#d8bf87',10);line([(225,86),(277,117),(331,86)],'#e2cb99',7)
  for x,y,r in [(203,53,6),(369,104,5),(346,39,4)]:oval((x-r,y-r,x+r,y+r),'#c5ad77')
 for x,y,r in [(165,113,5),(391,164,7),(367,55,3)]:oval((x-r,y-r,x+r,y+r),'#b5c7a4')
 return im.resize((1120,520),Image.Resampling.LANCZOS)
for kind in ['welcome','sign_in','password_changed','support_received','workspace_saved','preview','verify','reset']:
 scene(kind).save(ROOT/f'{kind}.png',optimize=True)
# Homepage Wordmark's original 29×30 geometry, rasterized on a light tile for dark inboxes.
im=Image.new('RGB',(120,120),'#eef1e7');d=ImageDraw.Draw(im)
def p(x,y):return ((x+5.5)*3,(y+5)*3)
d.polygon([p(x,y) for x,y in [(2,25),(2,13),(9,17),(9,5),(17,10),(17,1),(27,7),(27,25),(17,30)]],fill='#194637')
d.line([p(9,17),p(17,22),p(17,10)],fill='#f7f8f2',width=4);d.line([p(17,22),p(17,30)],fill='#f7f8f2',width=4)
im.save(ROOT/'invemon-icon.png',optimize=True)
print('Rendered eight individual illustrations and homepage logo icon.')
