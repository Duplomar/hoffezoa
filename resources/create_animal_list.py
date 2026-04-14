import json
from pathlib import Path
from typing import List, Dict, Any, Tuple

HERE = Path(__file__).parent
animals = list(map(lambda v: v.lower(), json.loads((HERE / "animal_list.json").read_text())))

class Taxon:
    def __init__(self, names: List[str], parent: 'Taxon' = None):
        self.names = names
        self.parent = parent
        self.children: List['Taxon'] = []
        self.index = None


def get_subtree(animals: List[str], latin_to_id: Dict[str, Tuple[int, int]], id_tree: Dict[int, int]) -> Dict[int, int]:
    subtree: Dict[int, int] = {}
    for animal in animals:
        node_id = latin_to_id[animal][0]
        parent_id = id_tree[node_id]
        while parent_id and parent_id != node_id:
            subtree[node_id] = parent_id
            node_id = parent_id
            parent_id = id_tree[parent_id]
        
        subtree[node_id] = node_id

    return subtree


def load_translations(animal_list: List[str], language: str) -> Dict[str, List[str]]:
    translation_file = HERE / f"translations_{language}.json"
    if not translation_file.is_file():
        print(f"Translation file {translation_file.name} does not exist")
        return None
    
    translations = json.loads(translation_file.read_text())
    if not isinstance(translations, dict) or not all([isinstance(t, list) for t in translations.values()]):
        print(f"Translation file must be a mapping of scientific name to array of {language} names")
        return None
    
    missing = []
    for animal in animal_list:
        if animal not in translations:
            missing.append(animal)

    if len(missing):
        print("Animals missing:")
        print("\n".join(missing))
        return None

    return translations


def create_animal_list(language: str, dataset: str):
    global animals
    translations = load_translations(animals, language)
    if not translations:
        return
    
    if dataset == "ncbi":
        latin_to_id = json.loads((HERE / "ncbi_dataset/latin_to_id.json").read_text())
        id_tree = {k: v for k, v in json.loads((HERE / "ncbi_dataset/ncbi_tree.json").read_text())}

    else:
        print("No matching dataset")
        return

    subtree = get_subtree(animals, latin_to_id, id_tree)
    del id_tree

    id_to_latin: Dict[int, List[Tuple[str, int]]] = {}
    for name, (node_id, prio) in latin_to_id.items():
        if node_id not in id_to_latin:
            id_to_latin[node_id] = []
        id_to_latin[node_id].append((prio, name))

    del latin_to_id

    id_to_latin = {k: list(map(lambda n_p: n_p[1], sorted(v))) for k, v in id_to_latin.items()}

    for node_id, parent_id in subtree.items():
        subtree[node_id] = {"parent": parent_id}
        latin_main = id_to_latin[node_id][0]
        if "<" in latin_main:
            latin_main = latin_main.split("<", 1)[0].strip()

        translated = False
        for la_word in id_to_latin[node_id]:
            if la_word in translations:
                if "names" in subtree:
                    print("Multiple translation for the same taxon id:", node_id)
                    return

                subtree[node_id]["names"] = [latin_main] + translations[la_word]
                translated = True
                break

        if not translated:
            subtree[node_id]["names"] = [latin_main, latin_main]

    return subtree
        

def get_lineage(node_id: int, named_subtree: Dict[int, Dict[str, Any]]) -> Taxon:
    if isinstance(named_subtree[node_id], Taxon):
        return named_subtree[node_id]
    
    names = named_subtree[node_id]["names"]
    parent_id = named_subtree[node_id]["parent"]
    if parent_id and parent_id != node_id:
        parent = get_lineage(parent_id, named_subtree)
    else:
        parent = None

    new_taxon = Taxon(names = names, parent=parent)
    if parent:
        parent.children.append(new_taxon)

    named_subtree[node_id] = new_taxon
    return new_taxon


def create_compact_tree(named_subtree: Dict[int, Dict[str, Any]]) -> Tuple[List, int]:
    last_node = None
    for node_id, v in named_subtree.items():
        if not isinstance(v, Taxon):
            get_lineage(node_id, named_subtree)
        last_node = named_subtree[node_id]

    while last_node.parent:
        last_node = last_node.parent
    
    root = last_node

    while len(root.children) == 1:
        root = root.children[0]

    root.parent = None
    compact_tree: List[Tuple] = []
    leafs: List[Taxon] = []
    queue: List[Taxon] = []
    queue.append(root)

    while len(queue):
        current = queue.pop(0)
        if len(current.children):
            current.index = len(compact_tree)
            compact_tree.append((current.names, current.parent.index if current.parent else current.index))
            queue.extend(sorted(current.children, key=lambda child: child.names[0]))
        else:
            leafs.append(current)
    
    for leaf in sorted(leafs, key=lambda l: l.names[0]):
        compact_tree.append([leaf.names, leaf.parent.index])
    
    return compact_tree

def move_animals_last(comp):
    global animals
    animals = set(animals)
    animals_start = -1
    for i in range(len(comp)-1, -1, -1):
        if comp[i][0][0] not in animals:
            animals_start = i + 1
            break
    
    for i in range(animals_start -2, -1, -1):
        if comp[i][0][0] in animals:
            print("Found out of place animal:", comp[i])
            comp[i], comp[animals_start - 1] = comp[animals_start - 1], comp[i]
            for node in comp:
                if node[1] == animals_start -1:
                    node[1] = i
                elif node[1] == i:
                    node[1] = animals_start -1
            animals_start -= 1

    return comp, animals_start


language = "en"
dataset = "ncbi"

print("Creating subtree")
named_subtree = create_animal_list(language, dataset)
if named_subtree:
    print("Creating list")
    comp = create_compact_tree(named_subtree)
    print("Fix animal position")
    comp, start = move_animals_last(comp)
    (HERE.parent / f"tree_{language}_{dataset}.json").write_text(
        json.dumps({
            "tree": comp,
            "leaf_start": start
        }, indent=1)
    )