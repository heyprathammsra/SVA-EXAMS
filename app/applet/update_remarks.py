with open('app/page.tsx', 'r') as f:
    content = f.read()

# 1. Update scroll buttons for fixed/sticky positioning and transparency when not in use
old_buttons = '''              {/* Left Horizontal Scroll Button */}
              <button
                type="button"
                data-testid="remarks-scroll-left"
                aria-label="Scroll remarks table left"
                title="Scroll left"
                onClick={() => scrollHorizontalBy(remarksScrollContainerRef.current, 'left')}
                className="absolute left-2.5 top-1/2 -translate-y-1/2 z-40 w-9 h-9 rounded-full bg-white/95 backdrop-blur-xs border border-slate-300 shadow-md text-slate-700 hover:bg-slate-900 hover:text-white hover:border-slate-900 active:scale-95 transition-all flex items-center justify-center cursor-pointer"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>

              {/* Right Horizontal Scroll Button */}
              <button
                type="button"
                data-testid="remarks-scroll-right"
                aria-label="Scroll remarks table right"
                title="Scroll right"
                onClick={() => scrollHorizontalBy(remarksScrollContainerRef.current, 'right')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 z-40 w-9 h-9 rounded-full bg-white/95 backdrop-blur-xs border border-slate-300 shadow-md text-slate-700 hover:bg-slate-900 hover:text-white hover:border-slate-900 active:scale-95 transition-all flex items-center justify-center cursor-pointer"
              >
                <ChevronRight className="w-4 h-4" />
              </button>'''

new_buttons = '''              {/* Left & Right Horizontal Scroll Buttons fixed/sticky on screen with transparency when not in use */}
              <div className="sticky top-1/2 -translate-y-1/2 z-40 w-full flex items-center justify-between pointer-events-none px-2 h-0 overflow-visible my-auto">
                <button
                  type="button"
                  data-testid="remarks-scroll-left"
                  aria-label="Scroll remarks table left"
                  title="Scroll left"
                  onClick={() => scrollHorizontalBy(remarksScrollContainerRef.current, 'left')}
                  className="pointer-events-auto w-9 h-9 rounded-full bg-white/95 backdrop-blur-sm border border-slate-300 shadow-md text-slate-700 opacity-30 hover:opacity-100 hover:bg-slate-900 hover:text-white hover:border-slate-900 active:scale-95 transition-all flex items-center justify-center cursor-pointer"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  data-testid="remarks-scroll-right"
                  aria-label="Scroll remarks table right"
                  title="Scroll right"
                  onClick={() => scrollHorizontalBy(remarksScrollContainerRef.current, 'right')}
                  className="pointer-events-auto w-9 h-9 rounded-full bg-white/95 backdrop-blur-sm border border-slate-300 shadow-md text-slate-700 opacity-30 hover:opacity-100 hover:bg-slate-900 hover:text-white hover:border-slate-900 active:scale-95 transition-all flex items-center justify-center cursor-pointer"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>'''

if old_buttons in content:
    content = content.replace(old_buttons, new_buttons)
    print('Scroll buttons updated successfully!')
else:
    print('Warning: old_buttons not found exactly')

# 2. Update Single Subject remarks header
old_th = '''                        <th className="py-2 px-3 text-left min-w-[340px] border-b border-l border-slate-200">
                          <div className="font-bold text-slate-800">{selectedRemarkScope} Teacher Remark</div>
                          <div className="text-[10px] font-normal text-slate-400 mt-0.5">Subject Teacher Observation</div>
                        </th>
                        <th className="py-2 px-3 text-left min-w-[320px] border-b border-l border-slate-200">
                          <div className="font-bold text-slate-800">Class Teacher Remark</div>
                          <div className="text-[10px] font-normal text-slate-400 mt-0.5">Overall Report Card Observation</div>
                        </th>'''

new_th = '''                        <th className="py-2 px-3 text-left min-w-[700px] flex-1 border-b border-l border-slate-200">
                          <div className="font-bold text-slate-800">{selectedRemarkScope} Teacher Remark</div>
                          <div className="text-[10px] font-normal text-slate-400 mt-0.5">Subject Teacher Observation</div>
                        </th>'''

if old_th in content:
    content = content.replace(old_th, new_th)
    print('Table header updated successfully!')
else:
    print('Warning: old_th not found')

# 3. Update empty state colSpan={6} to colSpan={5} in single subject view
old_colspan = '''                        <tr>
                          <td colSpan={6} className="py-12 text-center text-slate-400 text-sm border-b border-slate-100">'''

new_colspan = '''                        <tr>
                          <td colSpan={5} className="py-12 text-center text-slate-400 text-sm border-b border-slate-100">'''

if old_colspan in content:
    content = content.replace(old_colspan, new_colspan)
    print('ColSpan updated successfully!')
else:
    print('Warning: old_colspan not found')

# 4. Remove Class Teacher Remark td input cell in single subject view rows
# Let's find and remove the td containing ctCellKey input
import re
# We can use regex to remove the class teacher remark td cell in single subject view
pattern = re.compile(
    r'<td className="h-10 p-0 border-b border-l border-slate-200 bg-white focus-within:ring-2 focus-within:ring-inset focus-within:ring-blue-600 focus-within:z-10">\s*<input[^>]*ctCellKey[^>]*/>\s*</td>',
    re.DOTALL
)

# Let's inspect what ctCellKey td looks like in app/page.tsx
sub_td_pattern = re.compile(
    r'(<td className="h-10 p-0 border-b border-l border-slate-200 bg-white focus-within:ring-2 focus-within:ring-inset focus-within:ring-blue-600 focus-within:z-10">\s*<div className="flex items-center h-10 w-full">.*?</div>\s*</td>)\s*<td className="h-10 p-0 border-b border-l border-slate-200 bg-white focus-within:ring-2 focus-within:ring-inset focus-within:ring-blue-600 focus-within:z-10">\s*<input[^>]*ctCellKey[^>]*/>\s*</td>',
    re.DOTALL
)

if sub_td_pattern.search(content):
    content = sub_td_pattern.sub(r'\1', content)
    print('Class teacher remark td cell removed successfully via regex!')
else:
    print('Warning: sub_td_pattern not matched')

with open('app/page.tsx', 'w') as f:
    f.write(content)

print('app/page.tsx written successfully!')
