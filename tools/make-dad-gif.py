from PIL import Image, ImageDraw, ImageFilter, ImageChops
import math, random, numpy as np
SRC='/cursor/stores/user/grok-bot/agents/174a2de9-116a-49e2-9fa0-fdac312b8334/assets/c9f2d4cc5d7a3e42e3ecea5538b6d36eae02906db0bd1bb169890b2c70de8f15.jpg'
BG=(255,248,236)
im=Image.open(SRC).convert('RGB')
W=im.width
# background mask: near-white pixels connected to the border
a=np.asarray(im).astype(int)
white=(a.min(axis=2)>232)
m=Image.fromarray((white*255).astype('uint8')).copy()
seed=Image.new('L',m.size,0)
for pt in [(0,0),(W-1,0),(0,W-1),(W-1,W-1),(W//2,0),(W//2,W-1),(0,W//2),(W-1,W//2)]:
    if m.getpixel(pt)==255: ImageDraw.floodfill(m,pt,128)
bgmask=(np.array(m)==128); print('bg fraction', bgmask.mean())
alpha=Image.fromarray(((~bgmask)*255).astype('uint8')).filter(ImageFilter.MaxFilter(3)).filter(ImageFilter.GaussianBlur(1.6))
fig=im.copy(); fig.putalpha(alpha)
fig=fig.crop(fig.getbbox())
S=460; FIG_H=380
fig=fig.resize((int(fig.width*FIG_H/fig.height), FIG_H), Image.LANCZOS)
N=24
random.seed(7)
cols=[(239,83,80),(66,165,245),(255,202,40),(102,187,106),(171,71,188),(255,138,101),(236,64,122)]
conf=[dict(x=random.uniform(0,S),y=random.uniform(0,S),w=random.uniform(6,11),h=random.uniform(9,15),c=random.choice(cols),r=random.uniform(0,360),vr=random.choice([-1,1])*random.uniform(15,30),k=random.choice([1,2])) for _ in range(26)]
spark=[(random.uniform(30,S-30),random.uniform(20,S*0.55),random.uniform(0,1)) for _ in range(7)]
frames=[]
for f in range(N):
    t=f/N
    hop=abs(math.sin(math.pi*t))          # 0 at landing, 1 at top
    land=max(0,1-hop*4)                   # squash only near the ground
    sy=1+0.06*hop-0.09*land; sx=1-0.04*hop+0.08*land
    ang=4*math.sin(2*math.pi*t*2)
    fr=Image.new('RGB',(S,S),BG)
    d=ImageDraw.Draw(fr)
    # falling confetti (loops seamlessly: each falls k*S per loop)
    for p in conf:
        y=(p['y']+p['k']*S*t)%(S+30)-15; x=p['x']+6*math.sin(2*math.pi*(t+p['x']/S))
        rr=math.radians(p['r']+p['vr']*f); ch=abs(math.cos(rr))
        piece=Image.new('RGBA',(int(p['w']*2),int(p['h']*2)),(0,0,0,0)); dd=ImageDraw.Draw(piece)
        hh=max(2,p['h']*ch); dd.rectangle([p['w']/2,p['h']-hh/2,p['w']*1.5,p['h']+hh/2],fill=p['c']+(255,))
        piece=piece.rotate(p['r']+p['vr']*f*0.5,expand=1,resample=Image.BICUBIC)
        fr.paste(piece,(int(x-piece.width/2),int(y-piece.height/2)),piece)
    # sparkles twinkle
    for (sx0,sy0,ph) in spark:
        v=(math.sin(2*math.pi*(t*2+ph))+1)/2
        if v<0.35: continue
        r=4+9*v; c=(255,200,40)
        d.polygon([(sx0,sy0-r),(sx0+r*0.25,sy0-r*0.25),(sx0+r,sy0),(sx0+r*0.25,sy0+r*0.25),(sx0,sy0+r),(sx0-r*0.25,sy0+r*0.25),(sx0-r,sy0),(sx0-r*0.25,sy0-r*0.25)],fill=c)
    g=fig.resize((int(fig.width*sx),int(fig.height*sy)),Image.BICUBIC).rotate(ang,expand=1,resample=Image.BICUBIC)
    base_y=S-14   # feet line
    y=int(base_y-g.height-hop*34+ (g.height-fig.height*sy)/2)
    fr.paste(g,(int((S-g.width)/2),y),g)
    frames.append(fr)
frames[0].save('dad-preview.png')
# shared palette for small size / no flicker
big=Image.new('RGB',(S,S*4)); [big.paste(frames[i*6],(0,S*i)) for i in range(4)]
pal=big.quantize(colors=100,method=Image.MEDIANCUT)
q=[fr.quantize(palette=pal,dither=Image.Dither.FLOYDSTEINBERG) for fr in frames]
q[0].save('dad-celebrate.gif',save_all=True,append_images=q[1:],duration=55,loop=0,optimize=True,disposal=1)
import os; print(os.path.getsize('dad-celebrate.gif'))
