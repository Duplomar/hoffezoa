import express from "express";
import crypto from "crypto";
import fs from "fs";
const app = express()
const port = 3000

function create_taxon_tree() {
    return [
        [
            ["root", 0],
            ["ch_1_a", 0],
            ["ch_1_b", 0],
            ["ch_2_a", 1],
            ["ch_2_b", 1],
            ["and_1", 2],
            ["and_2", 4]
        ], 
        5
    ]
}
const [taxon_tree, animal_start_index] = create_taxon_tree()
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
        const [taxon, parent] = taxon_tree[i]
        todays_taxons.push(taxon)
        i = parent
    }
    todays_taxons.push(taxon_tree[0][0])

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
