# QuickNote


### Use case:
The main usecase for this plugin was to speed up my notetaking capabilitys in university classes where there are a lot of keywords coming at you quickly and you might not have a lot of time inbetween to write each induviualy.

### Dependecies:
  - Python
  - Flask
  - Ollama (llama 3.2B)

### Way it works:
Once loaded **QuickNote** creates a local server that has llama3.2 running in backround. When a new note is created **QuickNote** will pass the title it was created with to llama3.2 and generate a summary based on the title along with a example and some pretty formating, then put that summary at the beging of the note. On unloaded it will kill the server 

### Example:

[[lagrange multipliers]] ... -> "- ==Def== Lagrange Multipliers is a method used to find local maxima/minima of a function subject to constraints. It involves introducing a new variable (lambda) to balance the function with its constraint, ensuring an extremum point satisfies both conditions simultaneously. Example: Find maximum value of f(x,y) = x^2 + y^2 under constraint g(x,y) = x+y-1. "

