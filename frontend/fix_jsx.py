import sys

with open('src/App.jsx', 'r', encoding='utf-8') as f:
    content = f.read()

# Replace block 1
block1_search = """        <Routes>
          <Route path="/" element={<DashboardView />} />
          <Route path="/bot-lector" element={<BotLectorView />} />
          <Route path="/accounts-enjambre" element={<AccountsEnjambre />} />
        </Routes>

      </main>
          {/* Sidebar Dinámica: Controls (Not Connected) or Gifts (Connected) */}
          <div className={`${status === 'connected' ? 'col-span-12 lg:col-span-3' : 'col-span-12 lg:col-span-4'} space-y-6 transition-all duration-500`}>"""

block1_replace = """        <Routes>
          <Route path="/bot-lector" element={<BotLectorView />} />
          {/* <Route path="/accounts-enjambre" element={<AccountsEnjambre />} /> */}
          <Route path="/" element={
            <div className="space-y-6">
              <div className="grid grid-cols-12 gap-6">
                {/* Sidebar Dinámica: Controls (Not Connected) or Gifts (Connected) */}
                <div className={`${status === 'connected' ? 'col-span-12 lg:col-span-3' : 'col-span-12 lg:col-span-4'} space-y-6 transition-all duration-500`}>"""

if block1_search in content:
    content = content.replace(block1_search, block1_replace)
else:
    print("Block 1 not found verbatim. Will try regex.")
    import re
    content = re.sub(
        r'<Routes>.*?<Route path="/" element={<DashboardView />} />.*?</main>\s*\{\/\* Sidebar Dinámica: Controls \(Not Connected\) or Gifts \(Connected\) \*\/\}\s*<div className={`\$\{status === \'connected\' \? \'col-span-12 lg:col-span-3\' : \'col-span-12 lg:col-span-4\'\} space-y-6 transition-all duration-500`}>',
        block1_replace,
        content,
        flags=re.DOTALL
    )

# Replace block 2
block2_search = """        </section>
      </main>"""

block2_replace = """        </section>
            </div>
          } />
        </Routes>
      </main>"""

if block2_search in content:
    content = content.replace(block2_search, block2_replace)
else:
    print("Block 2 not found verbatim.")
    import re
    content = re.sub(
        r'        </section>\s*</main>',
        block2_replace,
        content
    )

with open('src/App.jsx', 'w', encoding='utf-8') as f:
    f.write(content)
print("Done.")
