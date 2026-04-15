import express from "express";
import crypto from "crypto";
import fs from "fs";
const app = express()
const port = 3000

function load_taxon_tree() {
    const data = JSON.parse(fs.readFileSync("./tree_en_ncbi.json", "utf-8"))
    return [
        data["tree"],
        data["leaf_start"]
    ]
}
const [taxon_tree, animal_start_index] = load_taxon_tree()
const taxon_length = 100
const page_template = fs.readFileSync(
    "./page.html", 
    "utf-8"
).replace(
    "{{ animal_start_index }}", 
    "" + animal_start_index
).replace(
    "{{ taxon_tree }}", 
    JSON.stringify(taxon_tree)
)

let todays_taxons = [];
let salt = 0;
let page = "";


function create_hash(text) {
    return crypto.createHash('sha-512').update(text).digest("base64")
}

function set_todays_animal(){
    salt = crypto.randomInt(2**32)
    todays_taxons = []

    let i = crypto.randomInt(animal_start_index, taxon_tree.length)
    while (i) {
        const [taxon_names, parent] = taxon_tree[i]
        todays_taxons.push(taxon_names[0])
        i = parent
    }
    todays_taxons.push(taxon_tree[0][0][0])

    todays_taxons = todays_taxons.reverse().map(
        (taxon, i) =>{
            return create_hash(`${i};${salt};${taxon}`)
        }
    )
    while (todays_taxons.length < taxon_length) {
        todays_taxons.push(create_hash(crypto.randomBytes(32)))
    }

    page = page_template.replace(
        "{{ salt }}", 
        "" + salt
    ).replace(
        "{{ animal_start_index }}", 
        "" + animal_start_index
    ).replace(
        "{{ todays_taxons }}", 
        JSON.stringify(todays_taxons)
    )
}

function schedule_new_animal(hour, minute) {
    const now = new Date();
    const next = new Date();

    next.setHours(hour, minute, 0, 0);

    if (next <= now) 
        next.setDate(next.getDate() + 1);
    

    const delay = next - now;

    setTimeout( 
        () => {
            set_todays_animal();
            setInterval(set_todays_animal, 24 * 60 * 60 * 1000);
        }, 
        delay
    );

}

set_todays_animal()
schedule_new_animal(0, 0)

app.get('/', (req, res) => {
  res.send(page)
})

app.listen(port, () => {console.log(`Example app listening on port ${port}`)})
