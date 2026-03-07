
import sys

path = r'c:\Users\PC\Desktop\antyVS\PPChat\src\App.tsx'
with open(path, 'r', encoding='utf-8') as f:
    lines = f.readlines()

# We want to delete from the line "// Redundant LandingSection removed."
# up to the line that contains "</div >" specifically before "if (showTermsPage) {"

start_index = -1
for i, line in enumerate(lines):
    if "// Redundant LandingSection removed." in line:
        start_index = i
        break

if start_index != -1:
    end_index = -1
    for i in range(start_index, len(lines)):
        if "if (showTermsPage) {" in lines[i]:
            # The div ends a few lines before this
            for j in range(i-1, start_index, -1):
                if "</div >" in lines[j]:
                    end_index = j
                    break
            break
    
    if end_index != -1:
        # Delete from start_index + 1 to end_index
        # We want to keep "// Redundant LandingSection removed." but delete the rest?
        # Actually let's delete the comment too.
        new_lines = lines[:start_index] + lines[end_index+1:]
        with open(path, 'w', encoding='utf-8') as f:
            f.writelines(new_lines)
        print(f"Deleted from line {start_index+1} to {end_index+1}")
    else:
        print("Could not find end index")
else:
    print("Could not find start index")
