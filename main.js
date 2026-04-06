import express from "express";
import crypto from "crypto";
const app = express()
const port = 3000
const taxon_length = 100

function create_animal_tree() {
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
const [taxon_tree, animal_start_index] = create_animal_tree()
let todays_taxons;
let salt;


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
    taxons.push(taxon_tree[0][0])

    todays_taxons = todays_taxons.reverse().map(
        (taxon, i) =>{
            //return `${i};${salt};${taxon}`
            return create_hash(`${i};${salt};${taxon}`)
        }
    )
    while (todays_taxons.length < taxon_length) {
        todays_taxons.push(create_hash(crypto.randomBytes(32)))
    }
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
  res.send('Hello World!')
})


//app.listen(port, () => {console.log(`Example app listening on port ${port}`)})
