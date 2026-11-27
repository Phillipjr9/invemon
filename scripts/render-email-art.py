"""Build lightweight, pre-rendered 3D email art. Requires Pillow (development only).
GIF plays once (~2.6s); first/last frame is a complete illustration. No remote art.
Run: python scripts/render-email-art.py
"""
from PIL import Image, ImageDraw, ImageFilter
from pathlib import Path
import math
ROOT = Path(__file__).resolve().parent.parent / 'public/assets/email'
ROOT.mkdir(parents=True, exist_ok=True)
S = 2
W,H = 560,230
BG = (233,238,224)
def render(t):
    im=Image.new('RGB',(W*S,H*S),BG)
    shadow=Image.new('RGBA',im.size)
    d=ImageDraw.Draw(shadow)
    bob=math.sin(t*2*math.pi)*5
    d.ellipse((198*S,187*S,365*S,204*S), fill=(20,55,37,42))
    shadow=shadow.filter(ImageFilter.GaussianBlur(12*S));im.paste(shadow,(0,0),shadow)
    d=ImageDraw.Draw(im)
    a=-.22+math.sin(t*2*math.pi)*.10
    b=.22+math.cos(t*2*math.pi)*.04
    def pt(x,y,z):
        xx=x*math.cos(a)+z*math.sin(a)
        zz=-x*math.sin(a)+z*math.cos(a)
        yy=y*math.cos(b)-zz*math.sin(b)
        zz=y*math.sin(b)+zz*math.cos(b)
        f=600/(600+zz)
        return ((280+xx*f)*S,(115+bob+yy*f)*S)
    def poly(points,fill):d.polygon([pt(*p) for p in points],fill=fill)
    # Thick forest envelope: three visible planes, with a raised paper letter.
    poly([(-85,-28,8),(85,-28,8),(85,72,8),(-85,72,8)],'#254e3b')
    poly([(85,-28,8),(94,-35,22),(94,65,22),(85,72,8)],'#123a2b')
    poly([(-85,72,8),(85,72,8),(94,65,22),(-76,65,22)],'#103526')
    # Paper and its edge have a little depth.
    poly([(-66,-78,3),(66,-78,3),(66,27,3),(-66,27,3)],'#c6d3b4')
    poly([(-69,-81,-1),(63,-81,-1),(63,24,-1),(-69,24,-1)],'#fbfcf6')
    for yy,xx in [(-52,34),(-36,46),(-20,28)]:
        d.line([pt(-43,yy,-2),pt(xx,yy,-2)],fill='#b3c5a4',width=3*S)
    poly([(-85,-28,-5),(0,35,-5),(-85,72,-5)],'#326346')
    poly([(85,-28,-6),(0,35,-6),(85,72,-6)],'#28563c')
    poly([(-85,72,-8),(0,8,-8),(85,72,-8)],'#3b7050')
    # Gold wax-like seal, with an inset mark.
    cx,cy=pt(0,36,-11);r=14*S
    d.ellipse((cx-r+S,cy-r+2*S,cx+r+S,cy+r+2*S),fill='#a17e4e')
    d.ellipse((cx-r,cy-r,cx+r,cy+r),fill='#d9bc83')
    d.line([(cx-5*S,cy),(cx-S,cy+4*S),(cx+6*S,cy-4*S)],fill='#456040',width=2*S)
    # Quiet orbit dots create depth without competing with the message.
    for x,y,r,c in [(-145,-25,5,'#b3c59e'),(137,36,8,'#c8d5b5'),(117,-63,4,'#97af83')]:
        x+=math.cos(t*2*math.pi+y)*3;y+=math.sin(t*2*math.pi+x)*4
        px,py=pt(x,y,10);d.ellipse((px-r*S,py-r*S,px+r*S,py+r*S),fill=c)
    return im.resize((W,H),Image.Resampling.LANCZOS)
frames=[render(i/31) for i in range(32)]
frames[0].save(ROOT/'perspective-envelope.png',optimize=True)
# No loop extension: one animation only, then a readable final frame.
frames[0].save(ROOT/'perspective-envelope.gif',save_all=True,append_images=frames[1:],duration=80,optimize=True,disposal=2)
print('Built email art:', [(p.name,p.stat().st_size) for p in ROOT.iterdir()])
