
<HTML>
<HEAD>
<TITLE>snarked dot com</TITLE>
<LINK REL=StyleSheet HREF="/config/snarked_style.css" TYPE="text/css" MEDIA=screen>
<LINK rel="SHORTCUT ICON" href="/favicon2.ico" type="image/x-icon">
</HEAD>
<BODY>


<div class="snarkedtable">
<div class="headerline">
<form action="/view-recipe.php">
<a href="/">snarked.com</a>: 
just like <em>your</em> recipe box, only <b>online.</b></a>
<span class="droplist">
<select name="shortname">
<option value="">pick a recipe</option><option value="banana_bread">Banana Bread</option>
<option value="refined_banana_bread">Banana Bread (Refined)</option>
<option value="black_forest_fudge">Black Forest Fudge</option>
<option value="chocolate_cake">Chocolate cake</option>
<option value="multigrain_pancakes">Cooks' Multigrain Pancakes</option>
<option value="cornmeal_pancakes">Cornmeal Pancakes</option>
<option value="crepes">Crepes</option>
<option value="kubideh">Kubideh</option>
<option value="chocolate_chip_cookies">Over-Size Chocolate Chip Cookies</option>
<option value="shanghainese_wontons">Shanghainese Wontons</option>
<option value="Smothered_Chicken">Smothered Chicken + Barley</option>
<option value="lemon_squares">Suchele-Inspired Lemon Squares</option>
</select><input type="submit"  value="go">
</span>
</form>
</div>
<div class="basictext">
<div class="headtext">Add a recipe</div><br>

<form action="add-recipe-2.php" method="post" enctype="multipart/form-data">
<table>
<tr>
	<td>Title </td><td ><input type="text" name="name"></td></tr>
	<td>Short name </td><td ><input type="text" name="shortname"></td></tr>
	<tr><td>Category </td><td ><select name=category>

<option value=1>All</option>
<option value=2>&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;food</option>
<option value=4>&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;sandwiches</option>
<option value=5>&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;desserts</option>
<option value=6>&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;cakes</option>
<option value=7>&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;cookies</option>
<option value=8>&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;main dishes</option>
<option value=9>&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;salads</option>
<option value=10>&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;soups</option>
<option value=11>&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;bread</option>
<option value=3>&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;drinks</option>
</select></td></tr>
	<tr><td>Description </td><td ><input size="35" type="text" name="description"></td></tr>
</table>
	<br>
	<b>Ingredients</b> (one per line):<br>
	<textarea name="ingredients" rows="8" cols="60" wrap="soft"></textarea><br><br>
	<b>Instructions</b> (html formatted):<br>
	<textarea name="instructions" rows="14" cols=60 wrap=soft></textarea><br><br>
 <input type="hidden" name="MAX_FILE_SIZE" value="2500000">  
  <table>	
<tr><td>Upload Image (1) </td><td ><input type="file" name="imgfile[]"></td></tr>
 <tr><td>	Upload Image (2) </td><td > <input type="file" name="imgfile[]"></td></tr>
<tr><td>	Upload Image (3) </td><td > <input type="file" name="imgfile[]"></td></tr>
<tr><td>	Your name </td><td ><input type=text name="submitter"></td></tr>
<tr><td>Your email </td><td ><input type=text name="email"></td></tr>
<tr><td>Repeat your entry<br>from the field above 'email'<br>(cheap CAPTCHA)</td><td><input type=text name="captcha"></td></tr>
</table>
	<input type=hidden name="submitted" value="1">
	<input type=submit  value="submit recipe">	
</form>
<div  class="closingline">snarked.com 2003, <a href="mailto:jmandel@alum.mit.edu">Josh Mandel</a></div>
</div>
</div>


</BODY>

</HTML>
