# 고정 해시(결정성) 테스트의 기대값을 실제 값으로 다시 고정한다. 규칙 변경으로 해시가 바뀌는 게 예상될 때만 쓴다(이유는 decisions.md 에 기록).
# 사용: python3 scripts/dev/repin-hashes.py  (저장소 루트에서)
import re,subprocess,glob
files="tests/engine/newGameSettings.test.ts tests/engine/breeders.test.ts tests/engine/playerSireCrops.test.ts tests/engine/starterStrength.test.ts tests/engine/stallionTradeIntegration.test.ts tests/engine/horseNaming.test.ts".split()
for it in range(4):
    out=subprocess.run(['npx','vitest','run',*files],stdout=subprocess.PIPE,stderr=subprocess.STDOUT,text=True).stdout
    pairs=re.findall(r'Expected: "([0-9a-f]{64})"\nReceived: "([0-9a-f]{64})"',out)
    # 객체 diff: '-' 줄들 다음 '+' 줄들이 올 수 있으므로 키 이름으로 짝짓는다(순서로 짝지으면 다른 키에 들어간다).
    for block in re.split(r'\n\s*\n', out):
        minus=dict(re.findall(r'^\s*-\s+"(\w+)": "([0-9a-f]{64})"',block,re.M))
        plus=dict(re.findall(r'^\s*\+\s+"(\w+)": "([0-9a-f]{64})"',block,re.M))
        pairs+=[(minus[k],plus[k]) for k in minus if k in plus and minus[k]!=plus[k]]
    if not pairs: print('done', re.findall(r'Tests .*',out)); break
    for a,b in pairs:
        for f in files:
            s=open(f).read()
            if a in s: open(f,'w').write(s.replace(a,b)); print('pin',f,a[:8],'->',b[:8])
